// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

enum PostStatus {
    Pending,
    Phase1Failed,
    Phase1Passed,
    Available,
    Unavailable,
    Inconclusive
}

struct Post {
    bytes32 postId;
    bytes32 cidHash;
    bytes32 kzgCommit;
    PostStatus status;
    address creator;
}
