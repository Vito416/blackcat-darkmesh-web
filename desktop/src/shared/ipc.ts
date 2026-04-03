export const TRUSTED_RENDERER_URLS = [
  "file://",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
];

export const INVOKE_CHANNELS = [
  "pipVault:read",
  "pipVault:write",
  "pipVault:clear",
  "pipVault:describe",
  "pipVault:list",
  "pipVault:readRecord",
  "pipVault:deleteRecord",
  "pipVault:enablePassword",
  "pipVault:disablePassword",
  "pipVault:export",
  "pipVault:import",
  "pipVault:scanIntegrity",
  "pipVault:lock",
  "pipVault:repairRecord",
  "pipVault:setHardwarePlaceholder",
  "pipVault:telemetry",
  "wallet:read",
  "wallet:select",
  "module:pick",
  "file:readText",
  "autoUpdate:check",
  "autoUpdate:install",
] as const;

export type InvokeChannel = (typeof INVOKE_CHANNELS)[number];

export const isTrustedRendererOrigin = (url: string | undefined): boolean => {
  if (!url) return false;
  return TRUSTED_RENDERER_URLS.some((prefix) => url.startsWith(prefix));
};
