// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../src/PostTypes.sol";
import "../src/EmeraldPostRegistry.sol";
import "../src/EmeraldDaAdapter.sol";

contract EmeraldContractsTest is Test {
    EmeraldPostRegistry private registry;
    EmeraldDaAdapter private adapter;

    bytes32 private constant CID = keccak256("cid");
    bytes32 private constant KZG = keccak256("kzg");

    function setUp() public {
        registry = new EmeraldPostRegistry(address(0));
        adapter = new EmeraldDaAdapter(address(registry));
        registry.setDaAdapter(address(adapter));
    }

    function testCreatePostStoresData() public {
        bytes32 postId = registry.createPost(CID, KZG);

        EmeraldPostRegistry.Post memory post = registry.getPost(postId);
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
}
