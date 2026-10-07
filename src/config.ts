import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Global Todex configuration.
 *
 * Credentials live in the user's home directory so a user never has to create a
 * project-level `.env` just to talk to a model:
 *
 *   ~/.config/todex/config.json
 *
 * Only FreeLLMAPI is supported today, but the shape (a named `provider` plus its
 * `apiKey`) and the provider tables below are intentionally extensible: adding a
 * provider means appending to `PROVIDER_KEY_ENV` and nothing else here.
 */

/** Providers Todex can authenticate against. Extend as new providers land. */
export type ProviderName = "freellmapi";

export interface TodexConfig {
  provider: ProviderName;
  apiKey: string;
}

/** Environment variable that overrides the stored key for each provider. */
const PROVIDER_KEY_ENV: Record<ProviderName, string> = {
  freellmapi: "FREELLMAPI_API_KEY",
};

const DEFAULT_PROVIDER: ProviderName = "freellmapi";

const CONFIG_DIR = path.join(os.homedir(), ".config", "todex");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

/** Absolute path of the global config file (useful for error messages). */
export function getConfigPath(): string {
  return CONFIG_FILE;
}

function isProviderName(value: unknown): value is ProviderName {
  return typeof value === "string" && value in PROVIDER_KEY_ENV;
}

function normalize(raw: unknown): TodexConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  return {
    provider: isProviderName(obj.provider) ? obj.provider : DEFAULT_PROVIDER,
    apiKey: typeof obj.apiKey === "string" ? obj.apiKey : "",
  };
}

/** Read the global config, or `null` when it is missing/invalid. */
export function getConfig(): TodexConfig | null {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    return normalize(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Persist the config, creating `~/.config/todex` when needed.
 *
 * The file is written with mode `0600` (and re-chmod'd afterwards so an existing
 * file with broader permissions is tightened too) because it stores secrets.
 * The stored key is also mirrored into `process.env` so the model layer, which
 * reads the environment lazily on first use, picks it up immediately.
 */
export function saveConfig(config: TodexConfig): TodexConfig {
  const normalized: TodexConfig = {
    provider: isProviderName(config.provider)
      ? config.provider
      : DEFAULT_PROVIDER,
    apiKey: String(config.apiKey ?? ""),
  };

  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });

  fs.writeFileSync(
    CONFIG_FILE,
    `${JSON.stringify(normalized, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 }
  );

  // Some filesystems/umasks ignore the mode on write; enforce it explicitly.
  try {
    fs.chmodSync(CONFIG_FILE, 0o600);
  } catch {
    // Best effort — a read-only/exotic FS should not crash the CLI.
  }

  const envName = PROVIDER_KEY_ENV[normalized.provider];
  if (envName && normalized.apiKey) {
    process.env[envName] = normalized.apiKey;
  }

  return normalized;
}

/** Convenience wrapper used by the first-run setup screen. */
export function saveApiKey(
  apiKey: string,
  provider: ProviderName = DEFAULT_PROVIDER
): TodexConfig {
  return saveConfig({ provider, apiKey: apiKey.trim() });
}

/**
 * Resolve the API key for a provider.
 *
 * Environment variables win so a developer can override the stored key, then the
 * global config file is consulted.
 */
export function getApiKey(
  provider: ProviderName = DEFAULT_PROVIDER
): string | undefined {
  const envName = PROVIDER_KEY_ENV[provider];
  const fromEnv = envName ? process.env[envName] : undefined;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();

  const config = getConfig();
  if (config && config.provider === provider && config.apiKey.trim()) {
    return config.apiKey.trim();
  }

  return undefined;
}

/** True when a usable key exists for the provider (env or config file). */
export function hasApiKey(provider: ProviderName = DEFAULT_PROVIDER): boolean {
  return getApiKey(provider) !== undefined;
}
