// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {PostStatus, Post} from "./PostTypes.sol";
import {MockKzgVerifier} from "./MockKzgVerifier.sol";

interface IEmeraldPostRegistry {
    function setStatusFromDa(bytes32 postId, PostStatus newStatus) external;
    function getPost(bytes32 postId) external view returns (Post memory);
}

contract EmeraldDaAdapter {
    struct Phase1State {
        uint256 yesStake;
        uint256 totalStake;
        address[] yesVoters;
        uint256 decidedAt;
        bool passed;
    }

    struct CustodyChallenge {
        address operator;
        uint256 challengeIndex;
        bool responded;
        bool success;
    }

    uint256 public constant YES_THRESHOLD_BPS = 5000; // 50%
    uint256 public constant CHALLENGE_RESPONSE_WINDOW = 1 days;

    address public owner;
    address public relay;
    IEmeraldPostRegistry public immutable registry;
    MockKzgVerifier public immutable verifier;
    mapping(bytes32 => Phase1State) private phase1State;
    mapping(bytes32 => CustodyChallenge[]) private challenges;

    error NotAuthorized();
    error InvalidStake();
    error InvalidPost();
    error PostDataMismatch();
    error Phase1Required();
    error NoYesVoters();
    error ChallengesAlreadyStarted();
    error NoChallenges();
    error ChallengeWindowNotElapsed();
    error UnknownChallenge();
    error AlreadyResponded();

    event Phase1DaPassed(bytes32 indexed postId, uint256 yesStake, uint256 totalStake);
    event Phase1DaFailed(bytes32 indexed postId, uint256 yesStake, uint256 totalStake);
    event CustodyChallengeStarted(bytes32 indexed postId, address indexed operator, uint256 challengeIndex);
    event CustodyProofSubmitted(bytes32 indexed postId, address indexed operator, bool success);
    event PostFinalized(bytes32 indexed postId, PostStatus finalStatus);
    event RelayUpdated(address indexed previousRelay, address indexed newRelay);

    constructor(address registryAddress, address verifierAddress) {
        if (registryAddress == address(0)) revert InvalidPost();
        if (verifierAddress == address(0)) revert InvalidPost();
        owner = msg.sender;
        relay = msg.sender;
        registry = IEmeraldPostRegistry(registryAddress);
        verifier = MockKzgVerifier(verifierAddress);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotAuthorized();
        _;
    }

    modifier onlyRelay() {
        if (msg.sender != relay) revert NotAuthorized();
        _;
    }

    function setRelay(address newRelay) external onlyOwner {
        address previous = relay;
        relay = newRelay;
        emit RelayUpdated(previous, newRelay);
    }

    function handleDaAttestation(
        bytes32 postId,
        bytes32 cidHash,
        bytes32 kzgCommit,
        address[] calldata yesVoters,
        uint256 yesStake,
        uint256 totalStake
    ) external onlyRelay {
        if (postId == bytes32(0)) revert InvalidPost();
        if (totalStake == 0 || yesStake == 0 || yesStake > totalStake) revert InvalidStake();

        Post memory post = registry.getPost(postId);
        if (post.cidHash != cidHash || post.kzgCommit != kzgCommit) revert PostDataMismatch();

        bool passed = _meetsThreshold(yesStake, totalStake);
        _recordPhase1Result(postId, passed, yesStake, totalStake, yesVoters);
    }

    function recordPhase1Result(
        bytes32 postId,
        bool passed,
        uint256 yesStake,
        uint256 totalStake,
        address[] calldata yesVoters
    ) external onlyOwner {
        if (postId == bytes32(0)) revert InvalidPost();
        if (totalStake == 0 || yesStake == 0 || yesStake > totalStake) revert InvalidStake();

        _recordPhase1Result(postId, passed, yesStake, totalStake, yesVoters);
    }

    function startCustodyChallenges(bytes32 postId) external onlyOwner {
        Phase1State storage state = phase1State[postId];
        if (!state.passed) revert Phase1Required();
        if (state.yesVoters.length == 0) revert NoYesVoters();
        if (challenges[postId].length != 0) revert ChallengesAlreadyStarted();

        for (uint256 i = 0; i < state.yesVoters.length; i++) {
            uint256 challengeIndex = uint256(keccak256(abi.encodePacked(postId, i)));
            challenges[postId].push(CustodyChallenge({
                operator: state.yesVoters[i],
                challengeIndex: challengeIndex,
                responded: false,
                success: false
            }));
            emit CustodyChallengeStarted(postId, state.yesVoters[i], challengeIndex);
        }
    }

    function submitCustodyProof(bytes32 postId, address operator, uint256 x, bytes calldata y, bytes calldata pi)
        external
    {
        CustodyChallenge[] storage entries = challenges[postId];
        uint256 idx = _findChallenge(entries, operator);
        CustodyChallenge storage entry = entries[idx];
        if (entry.responded) revert AlreadyResponded();

        Post memory post = registry.getPost(postId);
        bool ok = verifier.verifyKzgOpening(post.kzgCommit, x, y, pi);
        entry.responded = true;
        entry.success = ok;
        emit CustodyProofSubmitted(postId, operator, ok);
    }

    function finalizePostFromCustody(bytes32 postId) external onlyOwner {
        CustodyChallenge[] storage entries = challenges[postId];
        if (entries.length == 0) revert NoChallenges();

        Phase1State memory state = phase1State[postId];
        if (state.decidedAt == 0 || !state.passed) revert Phase1Required();
        if (block.timestamp < state.decidedAt + CHALLENGE_RESPONSE_WINDOW) revert ChallengeWindowNotElapsed();

        uint256 successCount;
        for (uint256 i = 0; i < entries.length; i++) {
            if (entries[i].success) {
                successCount++;
            }
        }

        PostStatus finalStatus = _meetsThreshold(successCount, entries.length)
            ? PostStatus.Available
            : PostStatus.Unavailable;

        registry.setStatusFromDa(postId, finalStatus);
        emit PostFinalized(postId, finalStatus);
    }

    function getPhase1State(bytes32 postId) external view returns (Phase1State memory) {
        return phase1State[postId];
    }

    function getCustodyChallenges(bytes32 postId) external view returns (CustodyChallenge[] memory) {
        return challenges[postId];
    }

    function _recordPhase1Result(
        bytes32 postId,
        bool passed,
        uint256 yesStake,
        uint256 totalStake,
        address[] calldata yesVoters
    ) internal {
        Phase1State storage state = phase1State[postId];
        state.yesStake = yesStake;
        state.totalStake = totalStake;
        state.decidedAt = block.timestamp;
        state.passed = passed;

        delete state.yesVoters;
        for (uint256 i = 0; i < yesVoters.length; i++) {
            state.yesVoters.push(yesVoters[i]);
        }

        PostStatus newStatus = passed ? PostStatus.Phase1Passed : PostStatus.Phase1Failed;
        registry.setStatusFromDa(postId, newStatus);

        if (passed) {
            emit Phase1DaPassed(postId, yesStake, totalStake);
        } else {
            emit Phase1DaFailed(postId, yesStake, totalStake);
        }
    }

    function _findChallenge(CustodyChallenge[] storage entries, address operator) internal view returns (uint256) {
        for (uint256 i = 0; i < entries.length; i++) {
            if (entries[i].operator == operator) {
                return i;
            }
        }
        revert UnknownChallenge();
    }

    function _meetsThreshold(uint256 yesStake, uint256 totalStake) internal pure returns (bool) {
        return yesStake * 10000 >= totalStake * YES_THRESHOLD_BPS;
    }
}
