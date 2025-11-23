// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

interface IKzgVerifier {
    /// @notice Verify a KZG opening proof for commitment at point x with value y.
    /// @dev Implementations may revert on malformed inputs or failed verification.
    function verifyKzgOpening(bytes calldata commitment, uint256 x, bytes calldata y, bytes calldata proof)
        external
        view
        returns (bool);
}
