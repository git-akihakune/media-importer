// Ambient declaration for Electron's `safeStorage`, which is provided by the
// Obsidian desktop host at runtime but has no npm type declarations in this
// project. Only the subset used by `SafeStorageSecretStore` is declared.
// esbuild lists `electron` as external so the real module is resolved by the
// Obsidian host at load time.
declare module "electron" {
  export interface SafeStorage {
    encryptString(plain: string): Buffer;
    decryptString(encrypted: Buffer): string;
    isEncryptionAvailable(): boolean;
  }
  export const safeStorage: SafeStorage;
}