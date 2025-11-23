export type Profile = "demo" | "prod";

type ProfileConfig = {
  label: string;
  dataServiceUrl: string;
};

const envDataDemo = import.meta.env.VITE_DATA_SERVICE_URL || "http://localhost:4000";
const envDataProd = import.meta.env.VITE_DATA_SERVICE_URL_PROD || envDataDemo;

export const profiles: Record<Profile, ProfileConfig> = {
  demo: {
    label: "Demo",
    dataServiceUrl: envDataDemo
  },
  prod: {
    label: "Prod",
    dataServiceUrl: envDataProd
  }
};

export function getActiveProfile(): { key: Profile; config: ProfileConfig } {
  const key = (import.meta.env.VITE_PROFILE as Profile) || "demo";
  const config = profiles[key] || profiles.demo;
  return { key, config };
}
