// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

contract MockKzgVerifier {
    bool public shouldVerify = true;

    event VerificationConfigured(bool shouldVerify);

    function setShouldVerify(bool value) external {
        shouldVerify = value;
        emit VerificationConfigured(value);
    }

    function verifyKzgOpening(bytes32 commitment, uint256 x, bytes calldata y, bytes calldata proof)
        external
        view
        returns (bool)
    {
        commitment;
        x;
        y;
        proof;
        return shouldVerify;
    }
}
