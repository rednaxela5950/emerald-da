// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {PostStatus, Post} from "./PostTypes.sol";

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

    address public owner;
    address public relay;
    IEmeraldPostRegistry public immutable registry;
    mapping(bytes32 => Phase1State) private phase1State;
    mapping(bytes32 => CustodyChallenge[]) private challenges;

    error NotAuthorized();
    error InvalidStake();
    error InvalidPost();
    error PostDataMismatch();

    event Phase1DaPassed(bytes32 indexed postId, uint256 yesStake, uint256 totalStake);
    event Phase1DaFailed(bytes32 indexed postId, uint256 yesStake, uint256 totalStake);
    event CustodyChallengeStarted(bytes32 indexed postId, address indexed operator, uint256 challengeIndex);
    event CustodyProofSubmitted(bytes32 indexed postId, address indexed operator, bool success);
    event PostFinalized(bytes32 indexed postId, PostStatus finalStatus);
    event RelayUpdated(address indexed previousRelay, address indexed newRelay);

    constructor(address registryAddress) {
        if (registryAddress == address(0)) revert InvalidPost();
        owner = msg.sender;
        relay = msg.sender;
        registry = IEmeraldPostRegistry(registryAddress);
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

    function _meetsThreshold(uint256 yesStake, uint256 totalStake) internal pure returns (bool) {
        return yesStake * 10000 >= totalStake * YES_THRESHOLD_BPS;
    }
}
