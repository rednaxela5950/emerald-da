// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {PostStatus, Post} from "./PostTypes.sol";

contract EmeraldPostRegistry {
    address public owner;
    address public daAdapter;
    uint256 public postCount;
    mapping(bytes32 => Post) private posts;

    error NotAuthorized();
    error InvalidInput();
    error PostNotFound();

    event PostCreated(bytes32 indexed postId, bytes32 indexed cidHash, bytes32 indexed kzgCommit, address creator);
    event PostStatusChanged(bytes32 indexed postId, PostStatus previousStatus, PostStatus newStatus);
    event DaAdapterUpdated(address indexed previousAdapter, address indexed newAdapter);

    constructor(address initialDaAdapter) {
        owner = msg.sender;
        daAdapter = initialDaAdapter;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotAuthorized();
        _;
    }

    modifier onlyDaAdapter() {
        if (msg.sender != daAdapter) revert NotAuthorized();
        _;
    }

    function setDaAdapter(address newAdapter) external onlyOwner {
        address previous = daAdapter;
        daAdapter = newAdapter;
        emit DaAdapterUpdated(previous, newAdapter);
    }

    function createPost(bytes32 cidHash, bytes32 kzgCommit) external returns (bytes32 postId) {
        if (cidHash == bytes32(0) || kzgCommit == bytes32(0)) revert InvalidInput();

        postId = keccak256(abi.encodePacked(msg.sender, cidHash, kzgCommit, postCount));
        posts[postId] = Post({
            postId: postId,
            cidHash: cidHash,
            kzgCommit: kzgCommit,
            status: PostStatus.Pending,
            creator: msg.sender
        });
        postCount += 1;
        emit PostCreated(postId, cidHash, kzgCommit, msg.sender);
    }

    function getPost(bytes32 postId) external view returns (Post memory) {
        Post memory post = posts[postId];
        if (post.postId == bytes32(0)) revert PostNotFound();
        return post;
    }

    function setStatusFromDa(bytes32 postId, PostStatus newStatus) external onlyDaAdapter {
        Post storage post = posts[postId];
        if (post.postId == bytes32(0)) revert PostNotFound();

        PostStatus previousStatus = post.status;
        post.status = newStatus;
        emit PostStatusChanged(postId, previousStatus, newStatus);
    }
}
