import * as vscode from "vscode";

/**
 * Senior Dev Note: We implement WebviewViewProvider to handle the lifecycle 
 * of the sidebar. This class acts as the bridge between the VS Code API 
 * and our HTML/JavaScript frontend.
 */
export class SidebarProvider implements vscode.WebviewViewProvider {
  // We keep a reference to the view so we can send messages to it later
  public _view?: vscode.WebviewView;

  // The extensionUri helps us find the path to our icons/scripts
  constructor(private readonly _extensionUri: vscode.Uri) {}

  /**
   * This is the "Entry Point" for the sidebar. 
   * It's called automatically when the user clicks the robot icon.
   */
  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    // Security: enable scripts so our HTML can be interactive
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // Set the initial HTML content
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    /**
     * Error Handling: We listen for messages coming FROM the sidebar.
     * Even if we don't have many now, a senior dev always sets up the listener.
     */
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "onInfo": {
          if (!data.value) { return; }
          vscode.window.showInformationMessage(data.value);
          break;
        }
        case "onError": {
          if (!data.value) { return; }
          vscode.window.showErrorMessage(data.value);
          break;
        }
      }
    });
  }

  /**
   * This public method allows the main extension.ts to "push" data here.
   * This is how we will update the filename.
   */
  public updateFilename(filename: string) {
    if (this._view) {
      // .postMessage sends data from TypeScript (Backend) to HTML (Frontend)
      this._view.webview.postMessage({
        type: 'update-file',
        value: filename
      });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>contextOS</title>
				<style>
					body { font-family: sans-serif; padding: 10px; color: var(--vscode-foreground); }
					.badge { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 4px 8px; border-radius: 4px; }
				</style>
			</head>
			<body>
				<h3>Current Context</h3>
				<p>File: <span id="file-label" class="badge">None</span></p>
				
				<script>
					const vscode = acquireVsCodeApi(); // Connect to the VS Code API
					const fileLabel = document.getElementById('file-label');

					// Listen for the "update-file" message from the Provider
					window.addEventListener('message', event => {
						const message = event.data; 
						if (message.type === 'update-file') {
							fileLabel.innerText = message.value;
						}
					});
				</script>
			</body>
			</html>`;
  }
}