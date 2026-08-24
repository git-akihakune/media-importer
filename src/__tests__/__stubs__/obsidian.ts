export class TFile {
  path = "";
  basename = "";
  extension = "";
}
export class Vault {
  getAbstractFileByPath(_path: string): TFile | null { return null; }
  getMarkdownFiles(): TFile[] { return []; }
  async read(_f: TFile): Promise<string> { return ""; }
  async modify(_f: TFile, _content: string): Promise<void> {}
  async modifyBinary(_f: TFile, _data: ArrayBuffer): Promise<void> {}
  async createBinary(_path: string, _data: ArrayBuffer): Promise<void> {}
  async readBinary(_f: TFile): Promise<ArrayBuffer> { return new ArrayBuffer(0); }
  async trashFile(_f: TFile): Promise<void> {}
  getConfig(_key: string): string { return ""; }
  adapter = { list: async (_p: string) => ({ files: [] as string[], folders: [] as string[] }) };
}
export const Platform = { isDesktop: true, isMobile: false, isMacOS: false, isWin: false, isLinux: false };
export interface RequestUrlParam {
  url: string;
  method?: string;
  body?: ArrayBuffer | string;
  headers?: Record<string, string>;
}
export interface RequestUrlResponse {
  status: number;
  arrayBuffer: ArrayBuffer;
  headers: Record<string, string>;
}
export async function requestUrl(_req: RequestUrlParam | string): Promise<RequestUrlResponse> {
  return { status: 200, arrayBuffer: new ArrayBuffer(0), headers: {} };
}