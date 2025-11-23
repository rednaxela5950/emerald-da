import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { fileURLToPath } from "url";
import { SymbioticRelaySdk } from "./relay.js";

let DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || "http://localhost:4000";

type WorkerConfig = {
  profile: string;
  dataServiceUrl: string;
  rpcUrl?: string;
  registryAddress?: string;
  adapterAddress?: string;
  verifierAddress?: string;
  relayEndpoint?: string;
  relayKeyTag?: number;
  relayRequiredEpoch?: bigint;
};

const CONFIG_PATH = process.env.CONFIG_PATH || "configs/demo.worker.json";

const REGISTRY_ABI = [
  "event PostCreated(bytes32 indexed postId, bytes32 indexed cidHash, bytes32 indexed kzgCommit, address creator)"
];
const ADAPTER_ABI = [
  "event CustodyChallengeStarted(bytes32 indexed postId, address indexed operator, uint256 challengeIndex)",
  "function submitCustodyProof(bytes32 postId, address operator, uint256 x, bytes y, bytes pi) external"
];

export type BlobResult =
  | { ok: true; cidHash: string; content: Uint8Array }
  | { ok: false; error: string };

async function fetchBlob(cidHash: string, baseUrl = DATA_SERVICE_URL): Promise<BlobResult> {
  const res = await fetch(`${baseUrl}/blob/${cidHash}`);
  if (!res.ok) {
    return { ok: false, error: `fetch failed: ${res.status}` };
  }
  const buffer = new Uint8Array(await res.arrayBuffer());
  return { ok: true, cidHash, content: buffer };
}

export async function verifyBlob(cidHash: string, content: Uint8Array): Promise<boolean> {
  const hex = `0x${createHash("sha256").update(Buffer.from(content)).digest("hex")}`;
  return cidHash.toLowerCase() === hex.toLowerCase();
}

async function handlePostCreated(
  postId: string,
  cidHash: string,
  kzgCommit: string,
  relay?: SymbioticRelaySdk
) {
  console.log(`[event] PostCreated ${postId} cid ${cidHash} kzg ${kzgCommit}`);
  const res = await fetchBlob(cidHash);
  if (!res.ok) {
    console.warn(`[event] failed to fetch blob ${cidHash}: ${res.error}`);
    return;
  }
  const valid = await verifyBlob(res.cidHash, res.content);
  console.log(`[event] blob verification for ${cidHash}: ${valid ? "ok" : "mismatch"}`);

  if (relay) {
    try {
      const signature = await relay.requestDaSignature(postId, cidHash, kzgCommit);
      console.log(
        `[relay] requested signature requestId=${signature.requestId} epoch=${signature.epoch} hash=${signature.messageHash}`
      );
      const proof = await relay.tryFetchAggregationProof(signature.requestId);
      if (proof) {
        console.log(`[relay] aggregation proof received (${proof.proof.length} bytes)`);
      } else {
        console.log("[relay] aggregation proof not ready yet (non-blocking)");
      }
    } catch (err) {
      console.warn(`[relay] failed to call Symbiotic Relay SDK: ${(err as Error).message}`);
    }
  }
}

async function handleCustodyChallenge(adapter: Contract, postId: string, operator: string) {
  console.log(`[event] CustodyChallengeStarted post=${postId} operator=${operator}`);
  try {
    const tx = await adapter.submitCustodyProof(postId, operator, 0, "0x", "0x");
    console.log(`[event] submitted custody proof tx=${tx.hash}`);
  } catch (err) {
    console.error(`[event] failed to submit custody proof`, err);
  }
}

function loadConfig(): WorkerConfig {
  const resolved = path.resolve(process.cwd(), CONFIG_PATH);
  const raw = fs.readFileSync(resolved, "utf8");
  const parsed = JSON.parse(raw) as WorkerConfig;
  return {
    ...parsed,
    dataServiceUrl: process.env.DATA_SERVICE_URL || parsed.dataServiceUrl,
    rpcUrl: process.env.RPC_URL || parsed.rpcUrl,
    registryAddress: process.env.REGISTRY_ADDRESS || parsed.registryAddress,
    adapterAddress: process.env.ADAPTER_ADDRESS || parsed.adapterAddress,
    verifierAddress: process.env.VERIFIER_ADDRESS || parsed.verifierAddress,
    relayEndpoint: process.env.RELAY_ENDPOINT || parsed.relayEndpoint,
    relayKeyTag: asNumber(preferEnvOrConfig(process.env.RELAY_KEY_TAG, parsed.relayKeyTag)),
    relayRequiredEpoch: asBigInt(preferEnvOrConfig(process.env.RELAY_REQUIRED_EPOCH, parsed.relayRequiredEpoch))
  };
}

function asNumber(value?: string | number): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asBigInt(value?: string | number | bigint): bigint | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number") return BigInt(value);
    if (typeof value === "string" && value.trim() === "") return undefined;
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function preferEnvOrConfig<T extends string | number | bigint>(
  envValue: string | undefined,
  configValue: T | undefined
): string | T | undefined {
  if (envValue === undefined || envValue === null) return configValue;
  if (envValue.trim() === "") return configValue;
  return envValue;
}

function createRelayClient(config: WorkerConfig): SymbioticRelaySdk | undefined {
  if (!config.relayEndpoint || config.relayKeyTag === undefined) return undefined;
  return new SymbioticRelaySdk({
    endpoint: config.relayEndpoint,
    keyTag: config.relayKeyTag,
    requiredEpoch: config.relayRequiredEpoch
  });
}

async function startOnChainListeners(config: WorkerConfig, relay?: SymbioticRelaySdk) {
  if (!config.rpcUrl || !config.registryAddress || !config.adapterAddress) {
    console.log(
      "on-chain listener disabled (rpcUrl, registryAddress, adapterAddress not all set in config/env)"
    );
    return;
  }
  const provider = new JsonRpcProvider(config.rpcUrl);
  const privateKey = process.env.PRIVATE_KEY || "";
  const wallet = privateKey ? new Wallet(privateKey, provider) : null;
  const registry = new Contract(config.registryAddress, REGISTRY_ABI, provider);
  const adapter = new Contract(config.adapterAddress, ADAPTER_ABI, wallet || provider);

  registry.on("PostCreated", async (postId: string, cidHash: string, kzgCommit: string) => {
    await handlePostCreated(postId, cidHash, kzgCommit, relay);
  });

  adapter.on("CustodyChallengeStarted", async (postId: string, operator: string) => {
    if (!wallet) {
      console.warn("[event] custody challenge received but PRIVATE_KEY not set; skipping proof submission");
      return;
    }
    await handleCustodyChallenge(adapter, postId, operator);
  });

  console.log("listening for PostCreated and CustodyChallengeStarted events");
}

export async function main() {
  const config = loadConfig();
  const dataServiceUrl = config.dataServiceUrl || DATA_SERVICE_URL;
  DATA_SERVICE_URL = dataServiceUrl;
  const relay = createRelayClient(config);
  console.log("emerald-da-worker starting");
  console.log(`profile: ${config.profile}`);
  console.log(`configured data service: ${dataServiceUrl}`);
  if (relay) {
    console.log(`relay sdk: ${config.relayEndpoint} (keyTag=${config.relayKeyTag})`);
  } else {
    console.log("relay sdk: disabled (set RELAY_ENDPOINT and RELAY_KEY_TAG to enable)");
  }
  await startOnChainListeners(config, relay);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
