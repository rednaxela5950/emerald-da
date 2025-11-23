export type Profile = "demo" | "prod";

type ProfileConfig = {
  label: string;
  dataServiceUrl: string;
  relayEndpoint?: string;
  relayKeyTag?: number;
  relayRequiredEpoch?: string;
};

const envDataDemo = import.meta.env.VITE_DATA_SERVICE_URL || "http://localhost:4000";
const envDataProd = import.meta.env.VITE_DATA_SERVICE_URL_PROD || envDataDemo;
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
    relayEndpoint: envRelayEndpointDemo || undefined,
    relayKeyTag: envRelayKeyTag,
    relayRequiredEpoch: envRelayRequiredEpoch || undefined
  },
  prod: {
    label: "Prod",
    dataServiceUrl: envDataProd,
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
