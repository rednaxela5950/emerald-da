import { createHash } from "crypto";

const DEFAULT_DATA_URL = process.env.DATA_SERVICE_URL || "http://localhost:4000";

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

export async function main() {
  console.log("emerald-da-worker starting");
  const exampleCid = "0x";
  console.log(`configured data service: ${DEFAULT_DATA_URL}`);
  if (exampleCid === "0x") {
    console.log("no cidHash provided; worker idle");
    return;
  }

  const result = await fetchBlob(exampleCid);
  if (!result.ok) {
    console.error(`failed to fetch blob: ${result.error}`);
    return;
  }

  const valid = await verifyBlob(result.cidHash, result.content);
  console.log(`verification result: ${valid}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
