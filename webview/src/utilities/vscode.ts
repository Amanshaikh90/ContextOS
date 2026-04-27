import type { WebviewApi } from "vscode-webview";

/**
 * A wrapper for the VS Code API to ensure it's only acquired once.
 */
class VSCodeAPIWrapper {
  private readonly vsCodeApi: WebviewApi<unknown> | undefined;

  constructor() {
    if (typeof acquireVsCodeApi === "function") {
      this.vsCodeApi = acquireVsCodeApi();
    }
  }

  public postMessage(message: unknown) {
    if (this.vsCodeApi) {
      this.vsCodeApi.postMessage(message);
    } else {
      console.warn("VS Code API not available. Are you running in a browser?");
    }
  }

  public getState(): unknown {
    return this.vsCodeApi?.getState();
  }

  public setState(state: unknown) {
    return this.vsCodeApi?.setState(state);
  }
}

export const vscode = new VSCodeAPIWrapper();