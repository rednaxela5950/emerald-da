// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../src/PostTypes.sol";
import "../src/EmeraldPostRegistry.sol";
import "../src/EmeraldDaAdapter.sol";
import "../src/MockKzgVerifier.sol";

contract EmeraldContractsTest is Test {
    EmeraldPostRegistry private registry;
    EmeraldDaAdapter private adapter;
    MockKzgVerifier private verifier;

    bytes32 private constant CID = keccak256("cid");
    bytes32 private constant KZG = keccak256("kzg");

    function setUp() public {
        registry = new EmeraldPostRegistry(address(0));
        verifier = new MockKzgVerifier();
        adapter = new EmeraldDaAdapter(address(registry), address(verifier));
        registry.setDaAdapter(address(adapter));
    }

    function testCreatePostStoresData() public {
        bytes32 postId = registry.createPost(CID, KZG);

        Post memory post = registry.getPost(postId);
        assertEq(post.postId, postId);
        assertEq(post.cidHash, CID);
        assertEq(post.kzgCommit, KZG);
        assertEq(uint256(post.status), uint256(PostStatus.Pending));
        assertEq(post.creator, address(this));
    }

    function testCreatePostRejectsZeroInputs() public {
        vm.expectRevert(EmeraldPostRegistry.InvalidInput.selector);
        registry.createPost(bytes32(0), KZG);
    }

    function testOnlyAdapterCanUpdateStatus() public {
        bytes32 postId = registry.createPost(CID, KZG);

        vm.expectRevert(EmeraldPostRegistry.NotAuthorized.selector);
        registry.setStatusFromDa(postId, PostStatus.Phase1Passed);

        vm.prank(address(adapter));
        registry.setStatusFromDa(postId, PostStatus.Phase1Passed);
    }

    function testAdapterRecordsPhase1PassAndUpdatesRegistry() public {
        bytes32 postId = registry.createPost(CID, KZG);
        address[] memory voters = new address[](2);
        voters[0] = address(0x1);
        voters[1] = address(0x2);

        vm.expectEmit(true, true, true, true, address(adapter));
        emit EmeraldDaAdapter.Phase1DaPassed(postId, 80, 100);
        adapter.recordPhase1Result(postId, true, 80, 100, voters);

        EmeraldDaAdapter.Phase1State memory state = adapter.getPhase1State(postId);
        assertEq(state.yesStake, 80);
        assertEq(state.totalStake, 100);
        assertTrue(state.passed);
        assertEq(state.yesVoters.length, 2);
        assertEq(uint256(registry.getPost(postId).status), uint256(PostStatus.Phase1Passed));
    }

    function testAdapterRecordsPhase1FailAndUpdatesRegistry() public {
        bytes32 postId = registry.createPost(CID, KZG);
        address[] memory voters = new address[](1);
        voters[0] = address(0x1);

        vm.expectEmit(true, true, true, true, address(adapter));
        emit EmeraldDaAdapter.Phase1DaFailed(postId, 10, 100);
        adapter.recordPhase1Result(postId, false, 10, 100, voters);

        EmeraldDaAdapter.Phase1State memory state = adapter.getPhase1State(postId);
        assertEq(state.yesStake, 10);
        assertEq(state.totalStake, 100);
        assertFalse(state.passed);
        assertEq(uint256(registry.getPost(postId).status), uint256(PostStatus.Phase1Failed));
    }

    function testAdapterRejectsInvalidStake() public {
        bytes32 postId = registry.createPost(CID, KZG);
        address[] memory voters = new address[](0);

        vm.expectRevert(EmeraldDaAdapter.InvalidStake.selector);
        adapter.recordPhase1Result(postId, true, 0, 0, voters);

        vm.expectRevert(EmeraldDaAdapter.InvalidStake.selector);
        adapter.recordPhase1Result(postId, true, 101, 100, voters);
    }

    function testHandleAttestationPassesAndUpdatesState() public {
        bytes32 postId = registry.createPost(CID, KZG);
        address[] memory voters = new address[](2);
        voters[0] = address(0x1);
        voters[1] = address(0x2);

        vm.expectEmit(true, true, true, true, address(adapter));
        emit EmeraldDaAdapter.Phase1DaPassed(postId, 60, 100);
        adapter.handleDaAttestation(postId, CID, KZG, voters, 60, 100);

        EmeraldDaAdapter.Phase1State memory state = adapter.getPhase1State(postId);
        assertTrue(state.passed);
        assertEq(state.yesStake, 60);
        assertEq(state.totalStake, 100);
        assertEq(state.yesVoters.length, 2);
        assertEq(uint256(registry.getPost(postId).status), uint256(PostStatus.Phase1Passed));
    }

    function testHandleAttestationFailsWhenBelowThreshold() public {
        bytes32 postId = registry.createPost(CID, KZG);
        address[] memory voters = new address[](1);
        voters[0] = address(0x1);

        vm.expectEmit(true, true, true, true, address(adapter));
        emit EmeraldDaAdapter.Phase1DaFailed(postId, 40, 100);
        adapter.handleDaAttestation(postId, CID, KZG, voters, 40, 100);

        EmeraldDaAdapter.Phase1State memory state = adapter.getPhase1State(postId);
        assertFalse(state.passed);
        assertEq(state.yesStake, 40);
        assertEq(state.totalStake, 100);
        assertEq(uint256(registry.getPost(postId).status), uint256(PostStatus.Phase1Failed));
    }

    function testHandleAttestationRejectsMismatchedData() public {
        bytes32 postId = registry.createPost(CID, KZG);
        address[] memory voters = new address[](1);
        voters[0] = address(0x1);

        vm.expectRevert(EmeraldDaAdapter.PostDataMismatch.selector);
        adapter.handleDaAttestation(postId, bytes32("bad"), KZG, voters, 60, 100);

        vm.expectRevert(EmeraldDaAdapter.PostDataMismatch.selector);
        adapter.handleDaAttestation(postId, CID, bytes32("bad"), voters, 60, 100);
    }

    function testHandleAttestationOnlyRelayAllowed() public {
        bytes32 postId = registry.createPost(CID, KZG);
        address[] memory voters = new address[](1);
        voters[0] = address(0x1);

        address untrusted = address(0xBEEF);
        adapter.setRelay(untrusted);

        vm.prank(address(this));
        vm.expectRevert(EmeraldDaAdapter.NotAuthorized.selector);
        adapter.handleDaAttestation(postId, CID, KZG, voters, 60, 100);

        vm.prank(untrusted);
        adapter.handleDaAttestation(postId, CID, KZG, voters, 60, 100);
    }

    function testStartChallengesRequiresPhase1Pass() public {
        bytes32 postId = registry.createPost(CID, KZG);

        vm.expectRevert(EmeraldDaAdapter.Phase1Required.selector);
        adapter.startCustodyChallenges(postId);
    }

    function testCustodyChallengesSuccessFlow() public {
        bytes32 postId = _createPhase1PassedPost();
        address[] memory voters = _defaultVoters();

        adapter.startCustodyChallenges(postId);

        EmeraldDaAdapter.CustodyChallenge[] memory challenges = adapter.getCustodyChallenges(postId);
        assertEq(challenges.length, voters.length);

        vm.prank(voters[0]);
        adapter.submitCustodyProof(postId, voters[0], 1, bytes("y"), bytes("pi"));
        vm.prank(voters[1]);
        adapter.submitCustodyProof(postId, voters[1], 2, bytes("y"), bytes("pi"));

        vm.warp(block.timestamp + adapter.CHALLENGE_RESPONSE_WINDOW() + 1);
        adapter.finalizePostFromCustody(postId);

        assertEq(uint256(registry.getPost(postId).status), uint256(PostStatus.Available));
    }

    function testCustodyChallengesFailureFlow() public {
        bytes32 postId = _createPhase1PassedPost();
        address[] memory voters = _defaultVoters();

        adapter.startCustodyChallenges(postId);

        verifier.setShouldVerify(false);
        vm.prank(voters[0]);
        adapter.submitCustodyProof(postId, voters[0], 1, bytes("y"), bytes("pi"));
        vm.prank(voters[1]);
        adapter.submitCustodyProof(postId, voters[1], 2, bytes("y"), bytes("pi"));

        vm.warp(block.timestamp + adapter.CHALLENGE_RESPONSE_WINDOW() + 1);
        adapter.finalizePostFromCustody(postId);

        assertEq(uint256(registry.getPost(postId).status), uint256(PostStatus.Unavailable));
    }

    function testFinalizeBeforeWindowReverts() public {
        bytes32 postId = _createPhase1PassedPost();
        address[] memory voters = _defaultVoters();

        adapter.startCustodyChallenges(postId);
        vm.prank(voters[0]);
        adapter.submitCustodyProof(postId, voters[0], 1, bytes("y"), bytes("pi"));

        vm.expectRevert(EmeraldDaAdapter.ChallengeWindowNotElapsed.selector);
        adapter.finalizePostFromCustody(postId);
    }

    function testSubmitUnknownChallengeReverts() public {
        bytes32 postId = _createPhase1PassedPost();
        adapter.startCustodyChallenges(postId);

        vm.expectRevert(EmeraldDaAdapter.UnknownChallenge.selector);
        adapter.submitCustodyProof(postId, address(0xBEEF), 1, bytes("y"), bytes("pi"));
    }

    function _createPhase1PassedPost() internal returns (bytes32 postId) {
        postId = registry.createPost(CID, KZG);
        adapter.recordPhase1Result(postId, true, 80, 100, _defaultVoters());
    }

    function _defaultVoters() internal pure returns (address[] memory voters) {
        voters = new address[](2);
        voters[0] = address(0x1);
        voters[1] = address(0x2);
    }
}
