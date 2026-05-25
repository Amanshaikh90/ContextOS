import * as vscode from "vscode";
import { getNonce } from "../utilities/getNonce";
import { WebviewMessageType, WebviewMessage } from "../types/messaging";
import { connectSocket, updateRepo, disconnectSocket } from "../utilities/socketClient";

export class SidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _currentRepo: string = '';             // track the active repo (empty = all)
  private _badgeView?: vscode.TreeView<any>;     // for activity bar badge

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _userId: string
  ) {}

  // Set the badge view from outside (extension.ts)
  public setBadgeView(badgeView: vscode.TreeView<any>) {
    this._badgeView = badgeView;
  }

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    this._setWebviewMessageListener(webviewView.webview);

    // Start WebSocket with empty repo (all repos)
    this._currentRepo = "";
    this._connectWebSocket("");
  }

  public updateContext(filename: string, folderName: string, repoName: string = ''): void {
    this._view?.webview.postMessage({
      type: WebviewMessageType.FileChanged,
      file: filename,
      folder: folderName,
      repo: repoName
    });

    // Update the stored repo and notify the WebSocket server
    this._currentRepo = repoName;
    updateRepo(repoName);
  }

  private _connectWebSocket(repo: string): void {
    const handler = (data: any) => {
      if (data && data.refresh === true) {
        // Webhook refresh signal → fetch correct context for this user's view
        this._fetchAndPostContext(data.repo || '');
      } else {
        // Other WebSocket messages (not currently used)
        this._view?.webview.postMessage({
          type: WebviewMessageType.ContextLoaded,
          value: { ...data, _source: 'websocket' },
        });
      }
    };
    connectSocket(this._userId, repo, handler);
  }

  private async _fetchAndPostContext(webhookRepo: string) {
    // Decide which repo to fetch based on the user's current view
    let fetchRepo = '';
    if (this._currentRepo === '') {
      // Viewing "all repos" → always fetch all
      fetchRepo = '';
    } else if (webhookRepo.toLowerCase() === this._currentRepo.toLowerCase()) {
      // Viewing a specific repo that matches the webhook → fetch that repo
      fetchRepo = webhookRepo;
    } else {
      // Webhook is for a different repo than the one being viewed → ignore
      return;
    }

    try {
      const url = new URL("http://localhost:3001/context");
      url.searchParams.append("userId", this._userId);
      if (fetchRepo) {url.searchParams.append("repo", fetchRepo);}
      url.searchParams.append("refresh", "true"); // bypass cache

      const response = await fetch(url.toString());
      if (!response.ok) {throw new Error(`Status ${response.status}`);}

      const result = await response.json();

      // Forward to webview
      this._view?.webview.postMessage({
        type: WebviewMessageType.ContextLoaded,
        value: { ...result, _source: 'websocket-refresh' },
      });

      // Update the activity bar badge
      this._updateBadge(result.github || []);
    } catch (err: any) {
      console.error("[contextOS] WebSocket refresh fetch failed:", err);
    }
  }

  private _updateBadge(prs: any[]) {
    if (!this._badgeView) {return;}
    const openCount = prs.filter((pr: any) => pr.status !== 'merged').length;
    const mergedCount = prs.filter((pr: any) => pr.status === 'merged').length;
    const total = openCount + mergedCount;
    if (total > 0) {
      this._badgeView.badge = {
        value: total,
        tooltip: `Open PRs: ${openCount} • Merged PRs: ${mergedCount}`
      };
    } else {
      this._badgeView.badge = undefined;
    }
  }

  // ───────── existing message listener (with added badge update) ─────────
  private _setWebviewMessageListener(webview: vscode.Webview): void {
    webview.onDidReceiveMessage(async (data: any) => {
      try {
        switch (data.type) {
          case "request-context-data": {
            const { file, folder, repo, refresh, skipAI } = data.payload || {};

            try {
              const url = new URL("http://localhost:3001/context");
              url.searchParams.append("userId", this._userId);
              if (file) {url.searchParams.append("file", file);};
              if (folder) {url.searchParams.append("folder", folder);};
              if (repo) {url.searchParams.append("repo", repo);};
              if (refresh) {url.searchParams.append("refresh", refresh);};
              if (skipAI) {url.searchParams.append("skipAI", skipAI);};

              const response = await fetch(url.toString());
              if (!response.ok) {
                throw new Error(`Backend responded with status: ${response.status}`);
              }

              const result = await response.json();

              webview.postMessage({
                type: WebviewMessageType.ContextLoaded,
                value: result
              });

              // Update badge after manual fetch
              this._updateBadge(result.github || []);
            } catch (fetchErr: any) {
              console.error("[contextOS] Error fetching from backend:", fetchErr);
              webview.postMessage({
                type: WebviewMessageType.Error,
                value: `Backend Connection Failed: ${fetchErr.message || fetchErr}`
              });
            }
            break;
          }

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

          case WebviewMessageType.Info:
            if (data.value) {vscode.window.showInformationMessage(data.value);};
            break;

          case WebviewMessageType.Error:
            if (data.value) {vscode.window.showErrorMessage(data.value);};
            break;

                    // ... inside _setWebviewMessageListener, after the existing cases, add:

            case "updatePrBadge": {
              const { openCount, mergedCount } = data.payload || {};
              if (!this._badgeView) return;
              const total = (openCount ?? 0) + (mergedCount ?? 0);
              if (total > 0) {
                this._badgeView.badge = {
                  value: total,
                  tooltip: `Open PRs: ${openCount ?? 0} • Merged PRs: ${mergedCount ?? 0}`
                };
              } else {
                this._badgeView.badge = undefined;
              }
              break;
            }

          default:
            console.warn(`[contextOS] Unhandled message type: ${data.type}`);
        }
      } catch (err) {
        console.error("[contextOS] Messaging Exception:", err);
      }
    });
  }

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
          connect-src ${webview.cspSource} https: http:;
        ">
        <title>contextOS</title>
      </head>
      <body>
        <div id="root"></div>

        <script nonce="${nonce}">
          window.userId = "${this._userId}";
        </script>

        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }
}