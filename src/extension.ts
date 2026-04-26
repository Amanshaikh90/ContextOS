import * as vscode from 'vscode';
import { SidebarProvider } from "./SidebarProvider";

export function activate(context: vscode.ExtensionContext) {

	console.log('Congratulations, your extension "contextos" is now active!');

    const sidebarProvider = new SidebarProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            "contextos.sidebarView",
            sidebarProvider
        )
    );

    /**
     * SENIOR DEV FEATURE: Event Listener
     * This triggers every time the user clicks on a different file tab.
     */
    const changeListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
            // Get the name of the file (e.g., "extension.ts")
            const fileName = editor.document.fileName.split('/').pop() || "Unknown";
            
            // Push that name to our Sidebar Provider
            sidebarProvider.updateFilename(fileName);
        }
    });

    // Add listener to subscriptions so it cleans up when extension is disabled
    context.subscriptions.push(changeListener);

    /**
     * Error Handling / Edge Case:
     * If a file is already open when the extension starts, show it immediately.
     */
    if (vscode.window.activeTextEditor) {
        const initialFile = vscode.window.activeTextEditor.document.fileName.split('/').pop() || "";
        // Small delay to ensure the webview is ready
        setTimeout(() => sidebarProvider.updateFilename(initialFile), 500);
    }
}

// This method is called when your extension is deactivated
export function deactivate() {}



//console.log('Congratulations, your extension "contextos" is now active!');