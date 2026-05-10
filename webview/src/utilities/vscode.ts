import type { WebviewApi } from "vscode-webview";

class VSCodeAPIWrapper {
  private readonly vsCodeApi: WebviewApi<unknown> | undefined;

  constructor() {
    if (typeof acquireVsCodeApi === "function") {
      // This is now the ONLY place in the whole project where this is called
      this.vsCodeApi = acquireVsCodeApi();
    }
  }

  public postMessage(message: any) {
    if (this.vsCodeApi) {
      this.vsCodeApi.postMessage(message);
    }
  }

  public getState(): any {
    return this.vsCodeApi?.getState();
  }

  public setState(state: any) {
    return this.vsCodeApi?.setState(state);
  }
}

export const vscode = new VSCodeAPIWrapper();