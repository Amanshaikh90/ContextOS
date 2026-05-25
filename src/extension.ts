import * as vscode from 'vscode';
import * as crypto from 'crypto'; 
import { SidebarProvider } from './providers/SidebarProvider';

async function getRepoFullName(uri: vscode.Uri): Promise<string> {
    try {
        const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
        if (!gitExtension) {
            return '';
        }
        const api = gitExtension.getAPI(1);
        const repo = api.getRepository(uri);
        
        if (repo && repo.state.remotes.length > 0) {
            const fetchUrl = repo.state.remotes[0].fetchUrl || '';
            const match = fetchUrl.match(/github\.com[/:](.+\/.+?)(?:\.git)?$/);
            return match ? match[1] : '';
        }
    } catch (e) {
        console.error("Git Repo Detection Error:", e);
    }
    return '';
}

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
                userId = Date.now().toString(36) + Math.random().toString(36).substring(2);
                context.globalState.update('contextos-user-id', userId);
            }
        }

        // 2. Initialize the Sidebar Provider with the userId
        const sidebarProvider = new SidebarProvider(context.extensionUri, userId!);

        // Create a tree view just for the badge (no visible tree content)
        const badgeTreeProvider = new class implements vscode.TreeDataProvider<any> {
            getTreeItem(): vscode.TreeItem { return {} as vscode.TreeItem; }
            getChildren(): any[] { return []; }
        };
        const badgeView = vscode.window.createTreeView('contextos.prBadge', {
            treeDataProvider: badgeTreeProvider,
            canSelectMany: false
        });
        sidebarProvider.setBadgeView(badgeView);
        context.subscriptions.push(badgeView);   // <-- necessary for proper cleanup

        if (vscode.window.activeTextEditor) {
            const editor = vscode.window.activeTextEditor;
            const fileName = editor.document.fileName.split(/[\\/]/).pop() || '';
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
            const folderName = workspaceFolder ? workspaceFolder.name : '';
            
            getRepoFullName(editor.document.uri).then(repoName => {
                sidebarProvider.updateContext(fileName, folderName, repoName);
            });
        }

        // 3. Register the Sidebar View
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                "contextos.sidebarView",
                sidebarProvider,
                {
                    webviewOptions: {
                        retainContextWhenHidden: true, 
                    },
                }
            )
        );

        // 4. Global Active Editor Change Listeners
        const fileWatcher = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
            if (editor) {
                const doc = editor.document;
                const fileName = doc.fileName.split(/[\\/]/).pop() || '';
                const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
                const folderName = workspaceFolder ? workspaceFolder.name : '';
                const repoName = await getRepoFullName(doc.uri);

                // Passes presentation parameters safely. Will not break or restart your fetches.
                sidebarProvider.updateContext(fileName, folderName, repoName);
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