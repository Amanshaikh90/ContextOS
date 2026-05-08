const esbuild = require("esbuild");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
    name: 'esbuild-problem-matcher',

    setup(build) {
        build.onStart(() => {
            console.log('[watch] build started');
        });
        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                if (location) {
                    console.error(`    ${location.file}:${location.line}:${location.column}:`);
                }
            });
            console.log('[watch] build finished');
        });
    },
};

async function main() {
    // --- 1. Extension Build Context (The Brain) ---
    const extensionCtx = await esbuild.context({
        // ENSURE THIS PATH MATCHES YOUR ACTUAL FILE LOCATION:
        entryPoints: ['src/extension.ts'], 
        bundle: true,
        format: 'cjs',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        outfile: 'dist/extension.js',
        external: ['vscode'],
        logLevel: 'silent',
        plugins: [esbuildProblemMatcherPlugin],
    });

    // --- 2. Webview Build Context (The Face) ---
    const webviewCtx = await esbuild.context({
        entryPoints: ['webview/src/main.tsx'], 
        bundle: true,
        format: 'iife', 
        minify: production,
        sourcemap: !production,
        platform: 'browser',
        outfile: 'dist/webview.js',
        define: {
            'process.env.NODE_ENV': production ? '"production"' : '"development"',
        },
        logLevel: 'silent',
        plugins: [esbuildProblemMatcherPlugin],
    });

    if (watch) {
        await Promise.all([
            extensionCtx.watch(),
            webviewCtx.watch()
        ]);
    } else {
        await Promise.all([
            extensionCtx.rebuild(),
            webviewCtx.rebuild()
        ]);
        await extensionCtx.dispose();
        await webviewCtx.dispose();
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});