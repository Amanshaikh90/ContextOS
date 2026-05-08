import * as vscode from 'vscode';
import { SidebarProvider } from './providers/SidebarProvider';

export function activate(context: vscode.ExtensionContext) {
    const sidebarProvider = new SidebarProvider(context.extensionUri);

    // Register the Sidebar
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            "contextos.sidebarView", // Ensure this matches your package.json view ID
            sidebarProvider
        )
    );

    // Listen for file changes and update the React app
    vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
            const fileName = editor.document.fileName.split('/').pop() || 'Unknown';
            sidebarProvider.updateFilename(fileName);
        }
    });
}

export function deactivate() {}