import * as vscode from 'vscode';
import * as crypto from 'crypto'; // Use standard import for better type support
import { SidebarProvider } from './providers/SidebarProvider';


export function activate(context: vscode.ExtensionContext) {
    try {
        // 1. Persistent User ID Management
        let userId = context.globalState.get<string>('contextos-user-id');
        
        if (!userId) {
            try {
                userId = crypto.randomUUID();
                context.globalState.update('contextos-user-id', userId);
                console.log(`[contextOS] New User ID generated: ${userId}`);
            } catch (uuidErr) {
                console.error("[contextOS] Failed to generate UUID:", uuidErr);
                // Fallback if randomUUID fails in older node versions
                userId = Date.now().toString(36) + Math.random().toString(36).substring(2);
                context.globalState.update('contextos-user-id', userId);
            }
        }

        // 2. Initialize the Sidebar Provider with the userId
        // This must match the constructor in your SidebarProvider.ts
        const sidebarProvider = new SidebarProvider(context.extensionUri, userId!);

        if (vscode.window.activeTextEditor) {
            const editor = vscode.window.activeTextEditor;
            const fileName = editor.document.fileName.split(/[\\/]/).pop() || '';
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
            const folderName = workspaceFolder ? workspaceFolder.name : '';
    
    // We wrap this in a small timeout to ensure the webview is ready
            setTimeout(() => {
                sidebarProvider.updateContext(fileName, folderName);
            }, 1000);
        }   

        // 3. Register the Sidebar View
        // CRITICAL: Ensure "contextos.sidebarView" matches the ID in your package.json
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                "contextos.sidebarView",
                sidebarProvider,
                {
                    webviewOptions: {
                        retainContextWhenHidden: true, // Keeps the React state alive when user switches tabs
                    },
                }
            )
        );

        // 4. Global Event Listeners
        const fileWatcher = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) {
        const doc = editor.document;
        const fileName = doc.fileName.split(/[\\/]/).pop() || '';
        
        // NEW LOGIC: Get the folder/project name
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
        const folderName = workspaceFolder ? workspaceFolder.name : '';

        // Change this call to send both
        sidebarProvider.updateContext(fileName, folderName);
    }
    });

        context.subscriptions.push(fileWatcher);

    } catch (mainErr) {
        vscode.window.showErrorMessage("ContextOS failed to initialize. Please check the developer console.");
        console.error("[contextOS] Activation Error:", mainErr);
    }
}

export function deactivate() {
    console.log("[contextOS] Extension deactivated.");
}