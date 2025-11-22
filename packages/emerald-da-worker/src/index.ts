import { createHash } from "crypto";
import { Contract, JsonRpcProvider, Wallet, ethers } from "ethers";

const DEFAULT_DATA_URL = process.env.DATA_SERVICE_URL || "http://localhost:4000";
const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS;
const ADAPTER_ADDRESS = process.env.ADAPTER_ADDRESS;

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

async function fetchBlob(cidHash: string, baseUrl = DEFAULT_DATA_URL): Promise<BlobResult> {
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

async function handlePostCreated(postId: string, cidHash: string) {
  console.log(`[event] PostCreated ${postId} cid ${cidHash}`);
  const res = await fetchBlob(cidHash);
  if (!res.ok) {
    console.warn(`[event] failed to fetch blob ${cidHash}: ${res.error}`);
    return;
  }
  const valid = await verifyBlob(res.cidHash, res.content);
  console.log(`[event] blob verification for ${cidHash}: ${valid ? "ok" : "mismatch"}`);
  // TODO: compute attestation payload and submit to relay/adapter once available.
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

async function startOnChainListeners() {
  if (!RPC_URL || !REGISTRY_ADDRESS || !ADAPTER_ADDRESS) {
    console.log("on-chain listener disabled (RPC_URL, REGISTRY_ADDRESS, ADAPTER_ADDRESS not all set)");
    return;
  }
  const provider = new JsonRpcProvider(RPC_URL);
  const wallet = PRIVATE_KEY ? new Wallet(PRIVATE_KEY, provider) : null;
  const registry = new Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);
  const adapter = new Contract(ADAPTER_ADDRESS, ADAPTER_ABI, wallet || provider);

  registry.on("PostCreated", async (postId: string, cidHash: string) => {
    await handlePostCreated(postId, cidHash);
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
  console.log("emerald-da-worker starting");
  console.log(`configured data service: ${DEFAULT_DATA_URL}`);
  await startOnChainListeners();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
