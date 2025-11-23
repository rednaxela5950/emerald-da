// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {IKzgVerifier} from "./IKzgVerifier.sol";

/// @notice KZG verifier that forwards to a precompile or external verifier contract.
/// @dev This assumes an EIP-4844-style point evaluation precompile at address 0x0A.
///      It may revert on chains without the precompile. Commitment is expected as
///      compressed bytes (e.g. 48-byte G1). Proof format must match the precompile.
contract PrecompileKzgVerifier is IKzgVerifier {
    address public immutable target;

    error VerificationFailed();

    constructor(address _target) {
        target = _target == address(0)
            ? address(0x000000000000000000000000000000000000000A)
            : _target;
    }

    function verifyKzgOpening(bytes calldata commitment, uint256 x, bytes calldata y, bytes calldata proof)
        external
        view
        override
        returns (bool)
    {
        // Input format is chain-specific; here we forward ABI-encoded params.
        (bool success, bytes memory out) = target.staticcall(abi.encode(commitment, x, y, proof));
        if (!success || out.length == 0) revert VerificationFailed();
        return abi.decode(out, (bool));
    }
}
