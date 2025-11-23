import express from "express";
import crypto from "crypto";

const app = express();
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});
app.use(express.raw({ type: "application/octet-stream", limit: "10mb" }));

const store = new Map<string, Buffer>();

function hashContent(buf: Buffer): string {
  return "0x" + crypto.createHash("sha256").update(buf).digest("hex");
}

app.post("/blob", (req, res) => {
  const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
  if (!buf.length) {
    return res.status(400).json({ error: "empty body" });
  }
  const cidHash = hashContent(buf);
  store.set(cidHash, buf);
  res.json({ cidHash });
});

app.get("/blob/:cidHash", (req, res) => {
  const cidHash = req.params.cidHash;
  const value = store.get(cidHash);
  if (!value) {
    return res.status(404).json({ error: "not found" });
  }
  res.setHeader("Content-Type", "application/octet-stream");
  res.send(value);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`dummy data service listening on ${port}`);
});
