import type { WebPreferences } from "electron";

export type SecurityPreferences = Pick<
  WebPreferences,
  "contextIsolation" | "nodeIntegration" | "sandbox" | "webSecurity" | "enableRemoteModule" | "preload"
> &
  Partial<WebPreferences>;

export const baseSecurityPrefs: Omit<SecurityPreferences, "preload"> = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  enableRemoteModule: false,
};

export const createSecurityPrefs = (preload: string): SecurityPreferences => ({
  ...baseSecurityPrefs,
  preload,
});

export const assertSecurityPrefs = (prefs: SecurityPreferences) => {
  if (!prefs.contextIsolation) throw new Error("contextIsolation must remain enabled");
  if (prefs.nodeIntegration) throw new Error("nodeIntegration must remain disabled");
  if (prefs.enableRemoteModule) throw new Error("remote module must remain disabled");
  if (prefs.sandbox === false) throw new Error("sandbox must remain enabled");
  if (prefs.webSecurity === false) throw new Error("webSecurity must remain enabled");
};

export type CspOptions = {
  connectSrc: string[];
  scriptSrc?: string[];
  styleSrc?: string[];
  imgSrc?: string[];
};

export const buildCsp = ({
  connectSrc,
  scriptSrc = ["'self'"],
  styleSrc = ["'self'"],
  imgSrc = ["'self'", "data:"],
}: CspOptions): string => {
  const directives = [
    `default-src 'self';`,
    `base-uri 'self';`,
    `object-src 'none';`,
    `frame-ancestors 'none';`,
    `img-src ${imgSrc.join(" ")};`,
    `script-src ${scriptSrc.join(" ")};`,
    `style-src ${styleSrc.join(" ")};`,
    `connect-src ${connectSrc.join(" ")};`,
    `font-src 'self' data:;`,
    `media-src 'self';`,
    `form-action 'self';`,
  ];

  return directives.join(" ");
};
