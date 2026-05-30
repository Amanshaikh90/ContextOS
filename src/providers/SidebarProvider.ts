import * as vscode from "vscode";
import { getNonce } from "../utilities/getNonce";
import { WebviewMessageType } from "../types/messaging";
import { connectSocket, updateRepo } from "../utilities/socketClient";

/**
 * Read backend URL from VS Code settings so it can be changed without
 * rebuilding the extension. Set in settings.json:
 *   "contextos.backendUrl": "https://contextos-production.up.railway.app/api"
 *
 * Defaults to the production URL so out-of-box install just works.
 */
function getBackendUrl(): string {
  const config = vscode.workspace.getConfiguration('contextos');
  return (
    config.get<string>('backendUrl') ||
    'https://contextos-production.up.railway.app/api'
  );
}

export class SidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _currentRepo = '';
  private _isGlobalDashboardMode = false;
  private _badgeView?: vscode.TreeView<any>;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _userId: string
  ) {}

  public setBadgeView(view: vscode.TreeView<any>) {
    this._badgeView = view;
  }

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    this._setWebviewMessageListener(webviewView.webview);
    this._currentRepo = '';
    this._isGlobalDashboardMode = false;
    this._connectWebSocket('');
  }

  public updateContext(filename: string, folderName: string, repoName = ''): void {
    if (this._isGlobalDashboardMode) {
      this._view?.webview.postMessage({
        type: WebviewMessageType.FileChanged,
        file: filename,
        folder: folderName,
        repo: '',
      });
      return;
    }

    this._view?.webview.postMessage({
      type: WebviewMessageType.FileChanged,
      file: filename,
      folder: folderName,
      repo: repoName,
    });

    this._currentRepo = repoName;
    updateRepo(repoName);
  }

  private _connectWebSocket(repo: string): void {
    const handler = (data: any) => {
      if (data?.refresh === true) {
        this._fetchAndPostContext(data.repo || '');
      } else {
        this._view?.webview.postMessage({
          type: WebviewMessageType.ContextLoaded,
          value: { ...data, _source: 'websocket' },
        });
      }
    };
    connectSocket(this._userId, repo, handler);
  }

  private async _fetchAndPostContext(webhookRepo: string): Promise<void> {
    let fetchRepo = '';
    if (this._currentRepo !== '' && webhookRepo.toLowerCase() !== this._currentRepo.toLowerCase()) {
      return;
    }
    fetchRepo = this._currentRepo === '' ? '' : webhookRepo;

    try {
      const backendUrl = getBackendUrl();
      const url = new URL(`${backendUrl}/context`);
      url.searchParams.set('userId', this._userId);
      if (fetchRepo) {url.searchParams.set('repo', fetchRepo);}
      url.searchParams.set('refresh', 'true');

      const response = await fetch(url.toString());
      if (!response.ok) {throw new Error(`Status ${response.status}`);}

      const result = await response.json();
      this._view?.webview.postMessage({
        type: WebviewMessageType.ContextLoaded,
        value: { ...result, _source: 'websocket-refresh' },
      });
      this._updateBadge(result.github || []);
    } catch (err: any) {
      console.error('[contextOS] WebSocket refresh failed:', err);
    }
  }

  private _updateBadge(prs: any[]): void {
    if (!this._badgeView) {return;}
    const open = prs.filter((pr: any) => pr.status !== 'merged').length;
    const merged = prs.filter((pr: any) => pr.status === 'merged').length;
    const total = open + merged;
    this._badgeView.badge = total > 0
      ? { value: total, tooltip: `Open: ${open} · Merged: ${merged}` }
      : undefined;
  }

  private _setWebviewMessageListener(webview: vscode.Webview): void {
    webview.onDidReceiveMessage(async (data: any) => {
      try {
        const backendUrl = getBackendUrl();

        switch (data.type) {
          case 'request-context-data': {
            const { file, folder, repo, refresh, skipAI } = data.payload || {};
            try {
              const url = new URL(`${backendUrl}/context`);
              url.searchParams.set('userId', this._userId);
              if (file) {url.searchParams.set('file', file);}
              if (folder) {url.searchParams.set('folder', folder);}
              if (repo) {url.searchParams.set('repo', repo);}
              if (refresh) {url.searchParams.set('refresh', refresh);}
              if (skipAI) {url.searchParams.set('skipAI', skipAI);}

              const response = await fetch(url.toString());
              if (!response.ok) {throw new Error(`Backend error: ${response.status}`);}
              const result = await response.json();
              webview.postMessage({ type: WebviewMessageType.ContextLoaded, value: result });
              this._updateBadge(result.github || []);
            } catch (fetchErr: any) {
              console.error('[contextOS] Fetch error:', fetchErr);
              webview.postMessage({
                type: WebviewMessageType.Error,
                value: `Backend connection failed: ${fetchErr.message}`,
              });
            }
            break;
          }

          case 'open-external-link': {
            const { url } = data;
            if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
              await vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
            } else {
              vscode.window.showErrorMessage('Invalid URL.');
            }
            break;
          }

          case 'auth-github':
            vscode.env.openExternal(vscode.Uri.parse(`${backendUrl}/auth/github?userId=${this._userId}`));
            break;
          case 'auth-jira':
            vscode.env.openExternal(vscode.Uri.parse(`${backendUrl}/auth/jira?userId=${this._userId}`));
            break;
          case 'auth-slack':
            vscode.env.openExternal(vscode.Uri.parse(`${backendUrl}/auth/slack?userId=${this._userId}`));
            break;

          case 'clear-repo-lock':
            this._currentRepo = '';
            this._isGlobalDashboardMode = true;
            updateRepo('');
            break;

          case 'updatePrBadge': {
            const { openCount, mergedCount } = data.payload || {};
            if (!this._badgeView) {break;}
            const total = (openCount ?? 0) + (mergedCount ?? 0);
            this._badgeView.badge = total > 0
              ? { value: total, tooltip: `Open: ${openCount ?? 0} · Merged: ${mergedCount ?? 0}` }
              : undefined;
            break;
          }

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
        console.error('[contextOS] Messaging error:', err);
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js')
    );
    const nonce = getNonce();
    const backendUrl = getBackendUrl();
    // Extract just the origin for CSP — never allow http: or https: wildcards
    const backendOrigin = new URL(backendUrl).origin;

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
          connect-src ${webview.cspSource} ${backendOrigin} wss:;
        ">
        <title>contextOS</title>
      </head>
      <body>
        <div id="root"></div>
        <script nonce="${nonce}">window.userId = "${this._userId}";</script>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }
}
