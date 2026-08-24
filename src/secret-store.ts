/**
 * Storage abstraction for sensitive credential values (WebDAV password,
 * S3 secret access key). Implementations back this interface with the
 * OS-backed store available in the current runtime — Obsidian's
 * `SecretStorage` when present (1.11.4+), Electron's `safeStorage`
 * otherwise, or an in-memory fallback for tests.
 *
 * The interface deliberately exposes only string-to-string semantics:
 * secret IDs are stable, lowercase-with-dashes identifiers (see
 * {@link SECRET_KEYS}) and values are opaque strings. Secrets are never
 * persisted in `data.json`; only non-secret configuration is.
 */

export interface SecretStore {
  /**
   * Persist a secret value. A value of `null` or empty string removes the
   * secret from the store (semantically "no secret configured").
   */
  set(id: string, value: string | null): Promise<void>;

  /**
   * Read a secret value. Returns `null` when no secret is stored under `id`.
   */
  get(id: string): Promise<string | null>;

  /**
   * Enumerate all currently-stored secret IDs (for diagnostics and
   * migration verification).
   */
  list(): Promise<string[]>;
}

/**
 * Pure in-memory implementation used for tests and as the no-op fallback
 * when no OS-backed store is available.
 */
export class InMemorySecretStore implements SecretStore {
  private store = new Map<string, string>();

  async set(id: string, value: string | null): Promise<void> {
    if (value == null || value === "") this.store.delete(id);
    else this.store.set(id, value);
  }

  async get(id: string): Promise<string | null> {
    return this.store.get(id) ?? null;
  }

  async list(): Promise<string[]> {
    return [...this.store.keys()];
  }
}