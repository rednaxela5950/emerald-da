import { useEffect, useMemo, useState } from "react";
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { getActiveProfile } from "./config/profiles";

const { key: PROFILE, config: PROFILE_CONFIG } = getActiveProfile();
const DATA_SERVICE_URL = PROFILE_CONFIG.dataServiceUrl.replace(/\/+$/, "");
const RELAY_ENDPOINT = PROFILE_CONFIG.relayEndpoint;
const RELAY_KEY_TAG = PROFILE_CONFIG.relayKeyTag;
const RELAY_REQUIRED_EPOCH = PROFILE_CONFIG.relayRequiredEpoch;
const RPC_URL = PROFILE_CONFIG.rpcUrl?.trim();
const REGISTRY_ADDRESS = PROFILE_CONFIG.registryAddress?.trim();
const ADAPTER_ADDRESS = PROFILE_CONFIG.adapterAddress?.trim();
const VERIFIER_ADDRESS = PROFILE_CONFIG.verifierAddress?.trim();
const DEV_PRIVATE_KEY = PROFILE_CONFIG.devPrivateKey?.trim();

type PostStatus =
  | "Pending"
  | "Phase1Passed"
  | "Phase1Failed"
  | "Available"
  | "Unavailable"
  | "Inconclusive";

interface PostRow {
  postId: string;
  cidHash: string;
  kzgCommit: string;
  status: PostStatus;
  blobName?: string;
  size?: number;
  creator?: string;
  txHash?: string;
}

type ChainState = {
  ready: boolean;
  error?: string;
  registry?: Contract;
  adapter?: Contract;
  verifier?: Contract;
  provider?: JsonRpcProvider;
  account?: string;
};

const REGISTRY_ABI = [
  "event PostCreated(bytes32 indexed postId, bytes32 indexed cidHash, bytes32 indexed kzgCommit, address creator)",
  "event PostStatusChanged(bytes32 indexed postId, uint8 previousStatus, uint8 newStatus)",
  "function createPost(bytes32 cidHash, bytes32 kzgCommit) external returns (bytes32)",
  "function getPost(bytes32 postId) external view returns (tuple(bytes32 postId, bytes32 cidHash, bytes32 kzgCommit, uint8 status, address creator))",
  "function postCount() external view returns (uint256)"
];

const ADAPTER_ABI = [
  "function recordPhase1Result(bytes32 postId, bool passed, uint256 yesStake, uint256 totalStake, address[] yesVoters) external",
  "function startCustodyChallenges(bytes32 postId) external",
  "function getCustodyChallenges(bytes32 postId) external view returns (tuple(address operator, uint256 challengeIndex, bool responded, bool success)[])",
  "function submitCustodyProof(bytes32 postId, address operator, uint256 x, bytes y, bytes pi) external",
  "function finalizePostFromCustody(bytes32 postId) external",
  "function CHALLENGE_RESPONSE_WINDOW() external view returns (uint256)",
  "event CustodyChallengeStarted(bytes32 indexed postId, address indexed operator, uint256 challengeIndex)"
];

const VERIFIER_ABI = ["function setShouldVerify(bool value) external"];

const statusPalette: Record<PostStatus, string> = {
  Pending: "#c084fc",
  Phase1Passed: "#22c55e",
  Phase1Failed: "#f97316",
  Available: "#10b981",
  Unavailable: "#ef4444",
  Inconclusive: "#eab308"
};

const statusNames: Record<number, PostStatus> = {
  0: "Pending",
  1: "Phase1Failed",
  2: "Phase1Passed",
  3: "Available",
  4: "Unavailable",
  5: "Inconclusive"
};

function statusFromNumber(value: number): PostStatus {
  return statusNames[value] || "Pending";
}

function normalizeBytes32(value: string): string {
  const trimmed = value.startsWith("0x") ? value.slice(2) : value;
  const safe = trimmed.padEnd(64, "0").slice(0, 64);
  return `0x${safe}`;
}

function shorten(hex: string, front = 6, back = 4): string {
  if (!hex) return "";
  if (hex.length <= front + back + 2) return hex;
  return `${hex.slice(0, front + 2)}…${hex.slice(-back)}`;
}

async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = Array.from(new Uint8Array(hashBuffer));
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `0x${hex}`;
}

export default function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [uploadState, setUploadState] = useState<{ status: "idle" | "busy" | "error"; message?: string }>(
    { status: "idle" }
  );
  const [chain, setChain] = useState<ChainState>({ ready: false });
  const [loadingPosts, setLoadingPosts] = useState(false);

  const heroSubtitle = useMemo(
    () =>
      "Upload a blob to the dummy data network, anchor it on-chain, and drive Emerald DA states with the adapter.",
    []
  );

  const relayStatus = useMemo(() => {
    const endpoint = RELAY_ENDPOINT?.trim();
    const keyTag = RELAY_KEY_TAG;
    const requiredEpoch = RELAY_REQUIRED_EPOCH?.trim();
    const enabled = Boolean(endpoint && keyTag !== undefined && keyTag !== null);
    const endpointLabel = endpoint || "not set";
    const keyTagLabel = keyTag !== undefined && keyTag !== null ? keyTag.toString() : "not set";
    const requiredEpochLabel = requiredEpoch || "";
    const summary = enabled
      ? `Requests DA signatures from ${endpointLabel} with keyTag=${keyTagLabel}${
          requiredEpochLabel ? ` (epoch hint ${requiredEpochLabel})` : ""
        }.`
      : "Relay SDK step is skipped until the worker is configured.";
    return { enabled, endpointLabel, keyTagLabel, requiredEpochLabel, summary };
  }, []);

  useEffect(() => {
    async function initChain() {
      if (!RPC_URL || !REGISTRY_ADDRESS) {
        setChain({ ready: false, error: "RPC_URL or REGISTRY_ADDRESS missing in build env." });
        return;
      }
      try {
        const provider = new JsonRpcProvider(RPC_URL);
        const signer = DEV_PRIVATE_KEY ? new Wallet(DEV_PRIVATE_KEY, provider) : undefined;
        const registry = new Contract(REGISTRY_ADDRESS, REGISTRY_ABI, signer ?? provider);
        const adapter = ADAPTER_ADDRESS ? new Contract(ADAPTER_ADDRESS, ADAPTER_ABI, signer ?? provider) : undefined;
        const verifier = VERIFIER_ADDRESS ? new Contract(VERIFIER_ADDRESS, VERIFIER_ABI, signer ?? provider) : undefined;
        setChain({
          ready: true,
          registry,
          adapter,
          verifier,
          provider,
          account: signer?.address
        });
        await loadPosts(registry);
      } catch (err) {
        setChain({
          ready: false,
          error: err instanceof Error ? err.message : "failed to init chain"
        });
      }
    }

    void initChain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [RPC_URL, REGISTRY_ADDRESS, ADAPTER_ADDRESS, VERIFIER_ADDRESS, DEV_PRIVATE_KEY]);

  useEffect(() => {
    if (!chain.registry) return;
    const onCreated = (postId: string, cidHash: string, kzgCommit: string, creator: string, event: any) => {
      const next: PostRow = {
        postId,
        cidHash,
        kzgCommit,
        creator,
        status: "Pending",
        txHash: event?.log?.transactionHash || event?.transactionHash
      };
      setPosts((prev) => upsertPost(prev, next));
    };
    const onStatusChanged = (postId: string, _prev: number, nextStatus: number) => {
      const status = statusFromNumber(Number(nextStatus));
      setPosts((prev) => prev.map((p) => (p.postId === postId ? { ...p, status } : p)));
    };
    chain.registry.on("PostCreated", onCreated);
    chain.registry.on("PostStatusChanged", onStatusChanged);
    return () => {
      chain.registry?.off("PostCreated", onCreated);
      chain.registry?.off("PostStatusChanged", onStatusChanged);
    };
  }, [chain.registry]);

  async function loadPosts(registry: Contract) {
    setLoadingPosts(true);
    try {
      const logs = await registry.queryFilter(registry.filters.PostCreated(), 0, "latest");
      const hydrated: PostRow[] = [];
      for (const log of logs) {
        const args = log.args || [];
        const postId = args.postId || args[0];
        const cidHash = args.cidHash || args[1];
        const kzgCommit = args.kzgCommit || args[2];
        const creator = args.creator || args[3];
        if (!postId) continue;
        try {
          const onchainPost = await registry.getPost(postId);
          const statusNum = Number(onchainPost.status ?? onchainPost[3] ?? 0);
          hydrated.push({
            postId: String(onchainPost.postId ?? postId),
            cidHash: String(onchainPost.cidHash ?? cidHash),
            kzgCommit: String(onchainPost.kzgCommit ?? kzgCommit),
            status: statusFromNumber(statusNum),
            creator: String(onchainPost.creator ?? creator)
          });
        } catch {
          hydrated.push({
            postId: String(postId),
            cidHash: String(cidHash),
            kzgCommit: String(kzgCommit),
            status: "Pending",
            creator: String(creator || "")
          });
        }
      }
      hydrated.sort((a, b) => (a.postId > b.postId ? -1 : 1));
      setPosts((prev) => mergePosts(prev, hydrated));
    } finally {
      setLoadingPosts(false);
    }
  }

  function requireChain(): asserts chain is ChainState & { ready: true; registry: Contract; provider: JsonRpcProvider } {
    if (!chain.registry || !chain.provider || !chain.ready) {
      throw new Error("Chain not ready (registry / provider missing)");
    }
  }

  async function handleUpload() {
    if (!selectedFile) {
      setUploadState({ status: "error", message: "Pick a file first." });
      return;
    }

    setUploadState({ status: "busy" });
    try {
      requireChain();
      const cidHash = await hashFile(selectedFile);
      const response = await fetch(`${DATA_SERVICE_URL}/blob`, {
        method: "POST",
        body: selectedFile,
        headers: { "Content-Type": "application/octet-stream" }
      });
      if (!response.ok) {
        throw new Error(`data service returned ${response.status}`);
      }
      const body = (await response.json()) as { cidHash: string };
      const storedCid = body.cidHash || cidHash;
      const kzgCommit = normalizeBytes32(storedCid);

      if (!chain.registry.runner || !("provider" in chain.registry.runner)) {
        throw new Error("Chain signer missing; cannot submit transaction");
      }
      const tx = await chain.registry.createPost(storedCid, kzgCommit);
      const receipt = await tx.wait();
      let postId = "";
      const iface = chain.registry.interface;
      for (const log of receipt.logs || []) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === "PostCreated") {
            postId = String(parsed.args.postId || parsed.args[0]);
            break;
          }
        } catch {
          // ignore
        }
      }
      if (!postId) {
        const blockLogs = await chain.registry.queryFilter(
          chain.registry.filters.PostCreated(),
          receipt.blockNumber,
          receipt.blockNumber
        );
        const matching = blockLogs.find((l: any) => l.transactionHash === tx.hash) || blockLogs[0];
        if (matching?.args?.postId) {
          postId = String(matching.args.postId);
        }
      }
      if (!postId) {
        postId = tx.hash;
      }

      const nextPost: PostRow = {
        postId,
        cidHash: storedCid,
        kzgCommit,
        status: "Pending",
        blobName: selectedFile.name,
        size: selectedFile.size,
        txHash: tx.hash
      };
      setPosts((prev) => upsertPost(prev, nextPost));
      setUploadState({ status: "idle", message: `Stored blob + created on-chain post. cidHash: ${storedCid}` });
    } catch (err) {
      setUploadState({ status: "error", message: err instanceof Error ? err.message : "upload failed" });
    }
  }

  async function handlePhase1(post: PostRow, passed: boolean) {
    if (!chain.adapter) {
      setUploadState({ status: "error", message: "Adapter not configured; cannot push phase 1 result on-chain." });
      return;
    }
    const adapterRunner: any = chain.adapter.runner;
    if (!adapterRunner || !adapterRunner.provider) {
      setUploadState({ status: "error", message: "Chain signer missing; cannot call adapter." });
      return;
    }
    try {
      const yesStake = passed ? 80 : 40;
      const totalStake = 100;
      const voters = [chain.account || adapterRunner.address || chain.registry?.runner?.address].filter(Boolean) as string[];
      const tx = await chain.adapter.recordPhase1Result(post.postId, passed, yesStake, totalStake, voters);
      await tx.wait();
      setUploadState({ status: "idle", message: `Phase 1 ${passed ? "pass" : "fail"} submitted on-chain.` });
    } catch (err) {
      setUploadState({
        status: "error",
        message: err instanceof Error ? err.message : "phase 1 tx failed"
      });
    }
  }

  async function handleFinalize(post: PostRow, target: "Available" | "Unavailable") {
    if (!chain.adapter || !chain.verifier) {
      setUploadState({
        status: "error",
        message: "Adapter or verifier not configured; cannot finalize on-chain."
      });
      return;
    }
    const adapterRunner: any = chain.adapter.runner;
    const provider = adapterRunner?.provider || null;
    if (!provider) {
      setUploadState({ status: "error", message: "Chain signer missing; cannot finalize." });
      return;
    }

    try {
      if (target === "Unavailable") {
        await chain.verifier.setShouldVerify(false);
      }

      await chain.adapter.startCustodyChallenges(post.postId);
      const challenges = await chain.adapter.getCustodyChallenges(post.postId);
      for (const entry of challenges as Array<{ operator: string }>) {
        await chain.adapter.submitCustodyProof(post.postId, entry.operator, 0, "0x", "0x");
      }

      const window = await chain.adapter.CHALLENGE_RESPONSE_WINDOW();
      try {
        await provider.send("evm_increaseTime", [Number(window) + 1]);
        await provider.send("evm_mine", []);
      } catch {
        // If time travel fails, finalize may revert; let it surface.
      }

      await chain.adapter.finalizePostFromCustody(post.postId);
      if (target === "Unavailable") {
        await chain.verifier.setShouldVerify(true).catch(() => {});
      }
      setUploadState({ status: "idle", message: `Finalized on-chain as ${target}.` });
    } catch (err) {
      setUploadState({
        status: "error",
        message: err instanceof Error ? err.message : "finalize tx failed"
      });
    }
  }

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Emerald + Symbiotic Relay</p>
          <h1>Data availability demo</h1>
          <p className="subhead">{heroSubtitle}</p>
          <div className="pill-row">
            <div className="pill">Profile: {PROFILE.toUpperCase()}</div>
            <div className="pill">Data service: {DATA_SERVICE_URL}</div>
            <div className="pill">RPC: {RPC_URL || "unset"}</div>
            <div className="pill">Registry: {shorten(REGISTRY_ADDRESS || "")}</div>
            <div className="pill">Signer: {chain.account ? shorten(chain.account) : "dev key (embedded)"}</div>
            <div className={`pill ${relayStatus.enabled ? "pill-on" : "pill-off"}`}>
              Relay SDK: {relayStatus.enabled ? "Enabled" : "Disabled"} · {relayStatus.endpointLabel}
              {relayStatus.enabled ? ` (keyTag=${relayStatus.keyTagLabel})` : ""}
            </div>
          </div>
          {chain.error && <p className="hint error">Chain error: {chain.error}</p>}
        </div>
      </header>

      <main className="grid">
        <section className="card relay-card">
          <div className="card-head">
            <h2>How the worker uses the Relay</h2>
            <p>Live view of the Relay SDK config baked into this build.</p>
          </div>
          <div className={`relay-banner ${relayStatus.enabled ? "on" : "off"}`}>
            <div className="relay-dot" aria-hidden />
            <div>
              <p className="label">{relayStatus.enabled ? "Relay enabled" : "Relay disabled"}</p>
              <p className="mono small">endpoint: {relayStatus.endpointLabel}</p>
              <p className="mono small">keyTag: {relayStatus.keyTagLabel}</p>
              {relayStatus.enabled ? (
                <p className="mono small">
                  requiredEpoch: {relayStatus.requiredEpochLabel || "not set (uses latest)"}
                </p>
              ) : (
                <p className="hint">Set VITE_RELAY_ENDPOINT + VITE_RELAY_KEY_TAG, then rebuild.</p>
              )}
            </div>
          </div>
          <ul className="relay-steps">
            <li>
              <span className="step-dot" aria-hidden />
              <div>Worker hears `PostCreated` events from the Emerald registry (when on-chain listeners are set).</div>
            </li>
            <li>
              <span className="step-dot" aria-hidden />
              <div>It fetches the blob from the data service and re-hashes it to confirm the cidHash matches.</div>
            </li>
            <li>
              <span className="step-dot" aria-hidden />
              <div>
                Relay SDK step: {relayStatus.summary} It calls `requestDaSignature(postId, cidHash, kzgCommit)` and
                logs the returned `requestId` and epoch.
              </div>
            </li>
            <li>
              <span className="step-dot" aria-hidden />
              <div>Then it tries `tryFetchAggregationProof(requestId)` to pull the aggregated proof once available.</div>
            </li>
          </ul>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>1) Upload a blob</h2>
            <p>We hash your file (sha256) to derive cidHash, push it to the dummy data network, and create an on-chain post.</p>
          </div>
          <label className="file-picker">
            <input
              type="file"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              aria-label="Select blob"
            />
            <span>{selectedFile ? selectedFile.name : "Choose a file"}</span>
          </label>
          <button className="primary" onClick={handleUpload} disabled={uploadState.status === "busy"}>
            {uploadState.status === "busy" ? "Uploading…" : "Upload + create on-chain post"}
          </button>
          {uploadState.message && (
            <p className={`hint ${uploadState.status === "error" ? "error" : ""}`}>{uploadState.message}</p>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>2) Drive on-chain DA outcomes</h2>
            <p>Call adapter functions to set Phase 1 and custody results on-chain (Anvil only).</p>
          </div>
          {loadingPosts && <p className="hint">Syncing posts from chain…</p>}
          {posts.length === 0 && !loadingPosts && <p className="hint">Upload something to see it here.</p>}
          <div className="post-list">
            {posts.map((post) => (
              <article key={post.postId} className="post">
                <div className="post-header">
                  <div>
                    <p className="label">postId</p>
                    <code className="mono">{post.postId}</code>
                  </div>
                  <span className="badge" style={{ backgroundColor: statusPalette[post.status] }}>
                    {post.status}
                  </span>
                </div>
                <div className="post-meta">
                  <div>
                    <p className="label">cidHash</p>
                    <code className="mono">{post.cidHash}</code>
                  </div>
                  <div>
                    <p className="label">kzgCommit</p>
                    <code className="mono">{post.kzgCommit}</code>
                  </div>
                  {post.creator && <p className="label">creator: {shorten(post.creator)}</p>}
                  {post.blobName && (
                    <p className="label">
                      {post.blobName} · {(post.size || 0) / 1024 < 0.1
                        ? `${post.size || 0} B`
                        : `${((post.size || 0) / 1024).toFixed(1)} KB`}
                    </p>
                  )}
                </div>
                <div className="actions">
                  <button onClick={() => handlePhase1(post, true)}>Phase 1 pass (on-chain)</button>
                  <button onClick={() => handlePhase1(post, false)}>Phase 1 fail (on-chain)</button>
                  <button onClick={() => handleFinalize(post, "Available")}>Finalize: Available (on-chain)</button>
                  <button onClick={() => handleFinalize(post, "Unavailable")}>Finalize: Unavailable (on-chain)</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function upsertPost(existing: PostRow[], next: PostRow): PostRow[] {
  const idx = existing.findIndex((p) => p.postId === next.postId);
  if (idx >= 0) {
    const copy = [...existing];
    copy[idx] = { ...copy[idx], ...next };
    return copy;
  }
  return [next, ...existing];
}

function mergePosts(existing: PostRow[], incoming: PostRow[]): PostRow[] {
  let result = [...existing];
  for (const post of incoming) {
    result = upsertPost(result, post);
  }
  return result;
}
