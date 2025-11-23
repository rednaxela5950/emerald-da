#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const contractsOut = path.join(root, "contracts", "out");

function loadArtifact(name) {
  const file = path.join(contractsOut, `${name}.sol`, `${name}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`artifact not found: ${file} — run forge build`);
  }
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw);
}

async function main() {
  const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
  const configRpcUrl = process.env.CONFIG_RPC_URL || process.env.RPC_URL_CONFIG || rpcUrl;
  const privateKey =
    process.env.PRIVATE_KEY ||
    // anvil default first account
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  console.log(`[deploy] using ${wallet.address} on ${rpcUrl}`);
  let nonce = await provider.getTransactionCount(wallet.address, "pending");

  const registryArtifact = loadArtifact("EmeraldPostRegistry");
  const adapterArtifact = loadArtifact("EmeraldDaAdapter");
  const verifierArtifact = loadArtifact("MockKzgVerifier");

  const Registry = new ethers.ContractFactory(
    registryArtifact.abi,
    registryArtifact.bytecode.object,
    wallet
  );
  const Verifier = new ethers.ContractFactory(
    verifierArtifact.abi,
    verifierArtifact.bytecode.object,
    wallet
  );
  const Adapter = new ethers.ContractFactory(
    adapterArtifact.abi,
    adapterArtifact.bytecode.object,
    wallet
  );

  console.log("[deploy] deploying EmeraldPostRegistry (adapter=zero for now)...");
  const registry = await Registry.deploy(ethers.ZeroAddress, { nonce: nonce++ });
  const registryAddress = await registry.getAddress();
  await registry.waitForDeployment();
  console.log(`[deploy] registry @ ${registryAddress}`);

  console.log("[deploy] deploying MockKzgVerifier...");
  const verifier = await Verifier.deploy({ nonce: nonce++ });
  const verifierAddress = await verifier.getAddress();
  await verifier.waitForDeployment();
  console.log(`[deploy] verifier @ ${verifierAddress}`);

  console.log("[deploy] deploying EmeraldDaAdapter...");
  const adapter = await Adapter.deploy(registryAddress, verifierAddress, { nonce: nonce++ });
  const adapterAddress = await adapter.getAddress();
  await adapter.waitForDeployment();
  console.log(`[deploy] adapter @ ${adapterAddress}`);

  console.log("[deploy] setting registry.daAdapter -> adapter");
  const tx = await registry.setDaAdapter(adapterAddress, { nonce: nonce++ });
  await tx.wait();

  const deployed = {
    rpcUrl: configRpcUrl,
    registryAddress,
    adapterAddress,
    verifierAddress,
    owner: wallet.address,
    chainId: await provider.getNetwork().then((n) => n.chainId.toString())
  };

  const demoConfigPath = path.join(root, "configs", "demo.worker.json");
  const prodConfigPath = path.join(root, "configs", "prod.worker.json");
  updateConfig(demoConfigPath, deployed);
  updateConfig(prodConfigPath, deployed);

  const outFile = path.join(root, "configs", "local.chain.json");
  fs.writeFileSync(outFile, JSON.stringify(deployed, null, 2));
  console.log(`[deploy] wrote ${outFile}`);
  console.log("[deploy] done");
}

function updateConfig(configPath, deployed) {
  if (!fs.existsSync(configPath)) return;
  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = JSON.parse(raw);
  const next = {
    ...parsed,
    rpcUrl: deployed.rpcUrl,
    registryAddress: deployed.registryAddress,
    adapterAddress: deployed.adapterAddress,
    verifierAddress: deployed.verifierAddress
  };
  fs.writeFileSync(configPath, JSON.stringify(next, null, 2));
  console.log(`[deploy] updated ${path.relative(process.cwd(), configPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
