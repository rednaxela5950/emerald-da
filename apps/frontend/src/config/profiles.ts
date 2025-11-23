export type Profile = "demo" | "prod";

type ProfileConfig = {
  label: string;
  dataServiceUrl: string;
  rpcUrl?: string;
  registryAddress?: string;
  adapterAddress?: string;
  verifierAddress?: string;
  devPrivateKey?: string;
  relayEndpoint?: string;
  relayKeyTag?: number;
  relayRequiredEpoch?: string;
};

const envDataDemo = import.meta.env.VITE_DATA_SERVICE_URL || "http://localhost:4000";
const envDataProd = import.meta.env.VITE_DATA_SERVICE_URL_PROD || envDataDemo;
const envRpcDemo = import.meta.env.VITE_RPC_URL || "";
const envRpcProd = import.meta.env.VITE_RPC_URL_PROD || envRpcDemo;
const envRegistryDemo = import.meta.env.VITE_REGISTRY_ADDRESS || "";
const envRegistryProd = import.meta.env.VITE_REGISTRY_ADDRESS_PROD || envRegistryDemo;
const envAdapterDemo = import.meta.env.VITE_ADAPTER_ADDRESS || "";
const envAdapterProd = import.meta.env.VITE_ADAPTER_ADDRESS_PROD || envAdapterDemo;
const envVerifierDemo = import.meta.env.VITE_VERIFIER_ADDRESS || "";
const envVerifierProd = import.meta.env.VITE_VERIFIER_ADDRESS_PROD || envVerifierDemo;
const envDevPrivateKeyDemo = import.meta.env.VITE_DEV_PRIVATE_KEY || "";
const envDevPrivateKeyProd = import.meta.env.VITE_DEV_PRIVATE_KEY_PROD || envDevPrivateKeyDemo;
const envRelayEndpointDemo = import.meta.env.VITE_RELAY_ENDPOINT || "";
const envRelayEndpointProd = import.meta.env.VITE_RELAY_ENDPOINT_PROD || envRelayEndpointDemo;
const envRelayKeyTag = parseNumber(import.meta.env.VITE_RELAY_KEY_TAG);
const envRelayKeyTagProd = parseNumber(import.meta.env.VITE_RELAY_KEY_TAG_PROD) ?? envRelayKeyTag;
const envRelayRequiredEpoch = cleanString(import.meta.env.VITE_RELAY_REQUIRED_EPOCH);
const envRelayRequiredEpochProd =
  cleanString(import.meta.env.VITE_RELAY_REQUIRED_EPOCH_PROD) || envRelayRequiredEpoch;

export const profiles: Record<Profile, ProfileConfig> = {
  demo: {
    label: "Demo",
    dataServiceUrl: envDataDemo,
    rpcUrl: envRpcDemo || undefined,
    registryAddress: envRegistryDemo || undefined,
    adapterAddress: envAdapterDemo || undefined,
    verifierAddress: envVerifierDemo || undefined,
    devPrivateKey: envDevPrivateKeyDemo || undefined,
    relayEndpoint: envRelayEndpointDemo || undefined,
    relayKeyTag: envRelayKeyTag,
    relayRequiredEpoch: envRelayRequiredEpoch || undefined
  },
  prod: {
    label: "Prod",
    dataServiceUrl: envDataProd,
    rpcUrl: envRpcProd || undefined,
    registryAddress: envRegistryProd || undefined,
    adapterAddress: envAdapterProd || undefined,
    verifierAddress: envVerifierProd || undefined,
    devPrivateKey: envDevPrivateKeyProd || undefined,
    relayEndpoint: envRelayEndpointProd || undefined,
    relayKeyTag: envRelayKeyTagProd,
    relayRequiredEpoch: envRelayRequiredEpochProd || undefined
  }
};

export function getActiveProfile(): { key: Profile; config: ProfileConfig } {
  const key = (import.meta.env.VITE_PROFILE as Profile) || "demo";
  const config = profiles[key] || profiles.demo;
  return { key, config };
}

function parseNumber(input: string | undefined): number | undefined {
  if (!input) return undefined;
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function cleanString(value: string | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}
