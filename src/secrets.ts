import { MediaImporterSettings } from "./settings";
import { SecretStore } from "./secret-store";

/**
 * Stable IDs for the secrets this plugin manages. These are the keys used
 * with {@link SecretStore}; only these IDs are ever read or written.
 */
export const SECRET_KEYS = {
  webdavPassword: "media-importer.webdav.password",
  s3SecretAccessKey: "media-importer.s3.secret-access-key",
} as const;

export type SecretId = typeof SECRET_KEYS[keyof typeof SECRET_KEYS];

/**
 * The runtime view of secrets, shaped the way the backends consume them.
 * Always present (possibly empty) so consumers can destructure unconditionally.
 */
export interface Secrets {
  webdavPassword: string;
  s3SecretAccessKey: string;
}

export const DEFAULT_SECRETS: Secrets = {
  webdavPassword: "",
  s3SecretAccessKey: "",
};

/**
 * Read all known secrets from `store` and return them as a {@link Secrets}.
 * Missing secrets resolve to empty strings.
 */
export async function loadSecrets(store: SecretStore): Promise<Secrets> {
  const [webdavPassword, s3SecretAccessKey] = await Promise.all([
    store.get(SECRET_KEYS.webdavPassword),
    store.get(SECRET_KEYS.s3SecretAccessKey),
  ]);
  return {
    webdavPassword: webdavPassword ?? "",
    s3SecretAccessKey: s3SecretAccessKey ?? "",
  };
}

/**
 * Shape of the raw `data.json` content as loaded by `Plugin.loadData()`.
 * The secret fields are optional because pre-1.0.0 versions stored them
 * here as plaintext; current versions never write them. This type is only
 * used by {@link migratePlaintextSecrets} to type the migration input.
 */
export interface LegacyData {
  webdav?: { password?: string } & Record<string, unknown>;
  s3?: { secretAccessKey?: string } & Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Result of migrating legacy plaintext credentials out of `data.json`.
 * Returned by {@link migratePlaintextSecrets}.
 */
export interface MigrationResult {
  /** Whether any plaintext secret was found and moved into the secret store. */
  migrated: boolean;
  /** The raw data with secret fields nulled out, ready to persist. */
  data: Record<string, unknown>;
}

/**
 * One-shot migration: if a pre-1.0.0 `data.json` contained `webdav.password`
 * or `s3.secretAccessKey` as plaintext, move those values into `store` and
 * blank the fields on the returned data so the next `saveData()` writes a
 * clean `data.json`. Safe to call on every load — no-ops when there is
 * nothing to migrate.
 *
 * Pre-existing secrets in `store` take precedence: if both the plaintext
 * field and the secret slot are populated, the plaintext is dropped and the
 * secret wins (the user has already migrated once).
 */
export async function migratePlaintextSecrets(
  data: LegacyData,
  store: SecretStore,
): Promise<MigrationResult> {
  let migrated = false;
  const next: Record<string, unknown> = { ...data };

  const webdav = data.webdav;
  if (webdav && typeof webdav.password === "string" && webdav.password !== "") {
    const existing = await store.get(SECRET_KEYS.webdavPassword);
    if (existing == null || existing === "") {
      await store.set(SECRET_KEYS.webdavPassword, webdav.password);
      migrated = true;
    }
    next.webdav = { ...webdav, password: "" };
  }

  const s3 = data.s3;
  if (s3 && typeof s3.secretAccessKey === "string" && s3.secretAccessKey !== "") {
    const existing = await store.get(SECRET_KEYS.s3SecretAccessKey);
    if (existing == null || existing === "") {
      await store.set(SECRET_KEYS.s3SecretAccessKey, s3.secretAccessKey);
      migrated = true;
    }
    next.s3 = { ...s3, secretAccessKey: "" };
  }

  return { migrated, data: next };
}

/**
 * Snapshot of the active backend's full configuration: non-secret settings
 * (from `data.json`) plus the secret values (from the secret store), merged
 * into the shape the backend constructors expect. Constructed at call time
 * via {@link resolveBackendConfig}; never persisted.
 */
export interface BackendConfig {
  webdav: { baseURL: string; username: string; password: string; avoidOverwrite: boolean };
  s3: { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; keyPrefix: string; publicUrlTemplate: string };
}

/**
 * Merge non-secret {@link MediaImporterSettings} with {@link Secrets} into
 * the {@link BackendConfig} shape that backend constructors consume. This
 * is the single place the two streams meet; everywhere else they are kept
 * strictly separate.
 */
export function resolveBackendConfig(settings: MediaImporterSettings, secrets: Secrets): BackendConfig {
  return {
    webdav: { ...settings.webdav, password: secrets.webdavPassword },
    s3: { ...settings.s3, secretAccessKey: secrets.s3SecretAccessKey },
  };
}