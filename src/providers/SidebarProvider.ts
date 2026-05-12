import * as vscode from "vscode";
import { getNonce } from "../utilities/getNonce";
import { WebviewMessageType, WebviewMessage } from "../types/messaging";

export class SidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  /**
   * The constructor now takes the userId generated in extension.ts
   * This ensures every request to the backend is linked to this specific user.
   */
  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _userId: string 
  ) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    this._setWebviewMessageListener(webviewView.webview);
  }

  /**
   * Sends a message to the React frontend (e.g., when a file is changed)
   */
  public updateContext(filename: string, folderName: string,repoName:string=''): void {
  this._view?.webview.postMessage({
    type: WebviewMessageType.FileChanged,
    file: filename,
    folder: folderName, // NEW LOGIC: Pass folder to React
    repo:repoName
  });
}

  /**
   * Listens for actions coming FROM the React Sidebar
   */
  private _setWebviewMessageListener(webview: vscode.Webview): void {
    webview.onDidReceiveMessage(async (data: any) => {
      try {
        switch (data.type) {
          // --- AUTHENTICATION TRIGGERS ---
          case 'open-external-link':
            if (data.url && (data.url.startsWith('http') || data.url.startsWith('https'))) {
              await vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(data.url));
            } else {
              vscode.window.showErrorMessage("Invalid URL: Could not open link.");
            }
            break;
          case "auth-jira":
            vscode.env.openExternal(vscode.Uri.parse(`http://localhost:3001/auth/jira?userId=${this._userId}`));
            break;

          case "auth-github":
            vscode.env.openExternal(vscode.Uri.parse(`http://localhost:3001/auth/github?userId=${this._userId}`));
            break;

          case "auth-slack":
            vscode.env.openExternal(vscode.Uri.parse(`http://localhost:3001/auth/slack?userId=${this._userId}`));
            break;

          // --- UI FEEDBACK ---
          case WebviewMessageType.Info:
            if (data.value) {vscode.window.showInformationMessage(data.value);}
            break;
            
          case WebviewMessageType.Error:
            if (data.value) {vscode.window.showErrorMessage(data.value);}
            break;

          default:
            console.warn(`[contextOS] Unhandled message type: ${data.type}`);
        }
      } catch (err) {
        console.error("[contextOS] Messaging Exception:", err);
      }
    });
  }

  /**
   * Generates the HTML for the sidebar and injects the global bridge variables
   */
  private _getHtmlForWebview(webview: vscode.Webview): string {
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
          connect-src ${webview.cspSource} http://localhost:3001 http://127.0.0.1:3001;
        ">
        <title>contextOS</title>
      </head>
      <body>
        <div id="root"></div>

        <script nonce="${nonce}">
          window.userId = "${this._userId}";
          window.backendUrl = "http://localhost:3001";
          
          // Provide a way for React to talk to VS Code logic
          //const vscode = acquireVsCodeApi();
          //window.vscode = vscode;
        </script>

        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }
}