// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {IKzgVerifier} from "./IKzgVerifier.sol";

contract MockKzgVerifier is IKzgVerifier {
    bool public shouldVerify = true;

    event VerificationConfigured(bool shouldVerify);

    function setShouldVerify(bool value) external {
        shouldVerify = value;
        emit VerificationConfigured(value);
    }

    function verifyKzgOpening(bytes calldata commitment, uint256 x, bytes calldata y, bytes calldata proof)
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
