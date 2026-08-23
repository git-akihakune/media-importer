export interface VaultAdapter {
  listMarkdownFiles(scanPaths: string[]): Promise<string[]>;
  read(path: string): Promise<string>;
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
  exists(path: string): Promise<boolean>;
  listDir(path: string): Promise<string[]>;
  modifyText(path: string, content: string): Promise<void>;
}
