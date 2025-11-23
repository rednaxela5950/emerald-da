import { useMemo, useState } from "react";
import { getActiveProfile } from "./config/profiles";

const { key: PROFILE, config: PROFILE_CONFIG } = getActiveProfile();
const DATA_SERVICE_URL = PROFILE_CONFIG.dataServiceUrl;
const RELAY_ENDPOINT = PROFILE_CONFIG.relayEndpoint;
const RELAY_KEY_TAG = PROFILE_CONFIG.relayKeyTag;
const RELAY_REQUIRED_EPOCH = PROFILE_CONFIG.relayRequiredEpoch;

type PostStatus =
  | "Pending"
  | "Phase1Passed"
  | "Phase1Failed"
  | "Available"
  | "Unavailable"
  | "Inconclusive";

interface PostRow {
  cidHash: string;
  kzgCommit: string;
  status: PostStatus;
  blobName?: string;
  size?: number;
}

const statusPalette: Record<PostStatus, string> = {
  Pending: "#c084fc",
  Phase1Passed: "#22c55e",
  Phase1Failed: "#f97316",
  Available: "#10b981",
  Unavailable: "#ef4444",
  Inconclusive: "#eab308"
};

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

  const heroSubtitle = useMemo(
    () =>
      "Upload a blob to the dummy data network, get a cidHash, and simulate how Emerald sees its DA state.",
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

  async function handleUpload() {
    if (!selectedFile) {
      setUploadState({ status: "error", message: "Pick a file first." });
      return;
    }

    setUploadState({ status: "busy" });
    try {
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

      const kzgCommit = `${cidHash.slice(0, 18)}${"0".repeat(46)}`;
      setPosts((prev) => [
        {
          cidHash: body.cidHash || cidHash,
          kzgCommit,
          status: "Pending",
          blobName: selectedFile.name,
          size: selectedFile.size
        },
        ...prev
      ]);
      setUploadState({ status: "idle", message: `Stored blob. cidHash: ${body.cidHash || cidHash}` });
    } catch (err) {
      setUploadState({ status: "error", message: err instanceof Error ? err.message : "upload failed" });
    }
  }

  function updateStatus(cidHash: string, status: PostStatus) {
    setPosts((prev) => prev.map((p) => (p.cidHash === cidHash ? { ...p, status } : p)));
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
            <div className={`pill ${relayStatus.enabled ? "pill-on" : "pill-off"}`}>
              Relay SDK: {relayStatus.enabled ? "Enabled" : "Disabled"} · {relayStatus.endpointLabel}
              {relayStatus.enabled ? ` (keyTag=${relayStatus.keyTagLabel})` : ""}
            </div>
          </div>
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
            <p>We hash your file (sha256) to derive cidHash, then push it to the dummy data network.</p>
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
            {uploadState.status === "busy" ? "Uploading…" : "Upload to data service"}
          </button>
          {uploadState.message && (
            <p className={`hint ${uploadState.status === "error" ? "error" : ""}`}>{uploadState.message}</p>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>2) Simulate DA outcomes</h2>
            <p>Update post status to mimic Relay attestations and custody checks.</p>
          </div>
          {posts.length === 0 && <p className="hint">Upload something to see it here.</p>}
          <div className="post-list">
            {posts.map((post) => (
              <article key={post.cidHash} className="post">
                <div className="post-header">
                  <div>
                    <p className="label">cidHash</p>
                    <code className="mono">{post.cidHash}</code>
                  </div>
                  <span className="badge" style={{ backgroundColor: statusPalette[post.status] }}>
                    {post.status}
                  </span>
                </div>
                <div className="post-meta">
                  <div>
                    <p className="label">kzgCommit</p>
                    <code className="mono">{post.kzgCommit}</code>
                  </div>
                  {post.blobName && (
                    <p className="label">
                      {post.blobName} · {(post.size || 0) / 1024 < 0.1
                        ? `${post.size || 0} B`
                        : `${((post.size || 0) / 1024).toFixed(1)} KB`}
                    </p>
                  )}
                </div>
                <div className="actions">
                  <button onClick={() => updateStatus(post.cidHash, "Phase1Passed")}>Phase 1 pass</button>
                  <button onClick={() => updateStatus(post.cidHash, "Phase1Failed")}>Phase 1 fail</button>
                  <button onClick={() => updateStatus(post.cidHash, "Available")}>Finalize: Available</button>
                  <button onClick={() => updateStatus(post.cidHash, "Unavailable")}>Finalize: Unavailable</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
