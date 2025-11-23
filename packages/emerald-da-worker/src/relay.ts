import { create } from "@bufbuild/protobuf";
import { createClient } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import {
  AggregationProof,
  GetAggregationProofRequestSchema,
  SignMessageRequestSchema,
  SymbioticAPIService
} from "@symbioticfi/relay-client-ts/dist/gen/v1/api_pb.js";
import { getBytes, keccak256, solidityPacked } from "ethers";

export type RelaySdkConfig = {
  endpoint: string;
  keyTag: number;
  requiredEpoch?: bigint;
};

export type RelaySignatureResult = {
  requestId: string;
  epoch: bigint;
  messageHash: string;
};

/**
 * Thin wrapper around the Symbiotic Relay SDK.
 */
export class SymbioticRelaySdk {
  private client;

  constructor(private readonly config: RelaySdkConfig) {
    this.client = createClient(SymbioticAPIService, createGrpcTransport({ baseUrl: this.config.endpoint }));
  }

  buildMessage(postId: string, cidHash: string, kzgCommit: string): string {
    // Encode the attestation tuple as a packed hash so the Relay signs an unambiguous payload.
    return keccak256(solidityPacked(["bytes32", "bytes32", "bytes32"], [postId, cidHash, kzgCommit]));
  }

  async requestDaSignature(postId: string, cidHash: string, kzgCommit: string): Promise<RelaySignatureResult> {
    const messageHash = this.buildMessage(postId, cidHash, kzgCommit);
    const request = create(SignMessageRequestSchema, {
      keyTag: this.config.keyTag,
      message: getBytes(messageHash),
      requiredEpoch: this.config.requiredEpoch
    });
    const response = await this.client.signMessage(request);
    return { requestId: response.requestId, epoch: response.epoch, messageHash };
  }

  async tryFetchAggregationProof(
    requestId: string,
    attempts = 2,
    delayMs = 1_000
  ): Promise<AggregationProof | undefined> {
    for (let i = 0; i < attempts; i++) {
      try {
        const proofResponse = await this.client.getAggregationProof(
          create(GetAggregationProofRequestSchema, { requestId })
        );
        if (proofResponse.aggregationProof) {
          return proofResponse.aggregationProof;
        }
      } catch {
        // Retry below.
      }
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return undefined;
  }
}
