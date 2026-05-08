import * as vscode from "vscode";
import { getNonce } from "../utilities/getNonce";
import { WebviewMessageType, WebviewMessage } from "../types/messaging";

export class SidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    this._setWebviewMessageListener(webviewView.webview);
  }

  public updateFilename(filename: string): void {
    this._view?.webview.postMessage({
      type: WebviewMessageType.FileChanged,
      file: filename,
    });
  }

  private _setWebviewMessageListener(webview: vscode.Webview): void {
    webview.onDidReceiveMessage(async (data: WebviewMessage) => {
      try {
        switch (data.type) {
          case WebviewMessageType.Info:
            if (data.value) vscode.window.showInformationMessage(data.value);
            break;
          case WebviewMessageType.Error:
            if (data.value) vscode.window.showErrorMessage(data.value);
            break;
          default:
            console.warn(`[contextOS] Unhandled message type: ${data.type}`);
        }
      } catch (err) {
        console.error("[contextOS] Messaging Exception:", err);
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    console.log("Generating HTML for Webview...");
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "dist", "webview.js")
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="
          default-src 'none';
          img-src ${webview.cspSource} https:;
          script-src 'nonce-${nonce}';
          style-src ${webview.cspSource} 'unsafe-inline';
          connect-src ${webview.cspSource} http://127.0.0.1:3001;
        ">
        <title>contextOS</title>
      </head>
      <body>
        <div id="root"></div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }
}