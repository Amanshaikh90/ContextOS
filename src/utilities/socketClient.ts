import WebSocket from 'ws';

type MessageHandler = (data: any) => void;

let ws: WebSocket | null = null;
let userId: string;
let currentRepo: string;
let onMessage: MessageHandler;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let resolvedWsUrl: string = '';

/**
 * Derive the WebSocket URL from the HTTP backend URL.
 * "https://contextos-production.up.railway.app/api" → "wss://contextos-production.up.railway.app"
 * "http://localhost:3001/api" → "ws://localhost:3001"
 */
function deriveWsUrl(backendUrl: string): string {
  return backendUrl
    .replace(/\/api\/?$/, '')        // strip /api suffix
    .replace(/^https:\/\//, 'wss://') // https → wss
    .replace(/^http:\/\//, 'ws://');  // http  → ws
}

/**
 * Open (or re-open) the WebSocket connection.
 * Pass backendUrl on first call; subsequent reconnects reuse the resolved URL.
 */
export function connectSocket(
  uid: string,
  repo: string,
  handler: MessageHandler,
  backendUrl?: string
): void {
  userId = uid;
  currentRepo = repo;
  onMessage = handler;

  // Resolve the WS URL once; reuse on reconnects
  if (backendUrl) {
    resolvedWsUrl = deriveWsUrl(backendUrl);
  }
  if (!resolvedWsUrl) {
    // Hard fallback so old code that doesn't pass backendUrl still works
    resolvedWsUrl = 'wss://contextos-production.up.railway.app';
  }

  // Close any stale connection before opening a new one
  if (ws) {
    try { ws.close(); } catch { /* ignore */ }
    ws = null;
  }

  try {
    console.log(`[WS Client] Connecting to ${resolvedWsUrl}`);
    ws = new WebSocket(resolvedWsUrl);

    ws.on('open', () => {
      console.log('[WS Client] Connected');
      sendSubscribe();
      // Clear any pending reconnect since we succeeded
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
    });

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        // Server sends { type: 'contextUpdate', payload: ... }
        if (message.type === 'contextUpdate') {
          onMessage(message.payload);
        }
        // auth_ok is just an acknowledgement — no action needed
      } catch (err) {
        console.error('[WS Client] Failed to parse message:', err);
      }
    });

    ws.on('error', (err) => {
      console.error('[WS Client] Connection error:', err);
      // on('close') will fire after error and trigger reconnect
    });

    ws.on('close', () => {
      console.log('[WS Client] Disconnected. Reconnecting in 5 s...');
      scheduleReconnect();
    });
  } catch (err) {
    console.error('[WS Client] Failed to create WebSocket:', err);
    scheduleReconnect();
  }
}

function sendSubscribe(): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: 'subscribe',
        payload: { userId, repo: currentRepo },
      })
    );
  }
}

/** Update the repo subscription without tearing down the connection. */
export function updateRepo(newRepo: string): void {
  currentRepo = newRepo;
  sendSubscribe();
}

export function disconnectSocket(): void {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  if (ws) {
    try { ws.close(); } catch { /* ignore */ }
    ws = null;
  }
}

function scheduleReconnect(): void {
  if (reconnectTimeout) {return; }// already scheduled
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    connectSocket(userId, currentRepo, onMessage); // backendUrl already stored in resolvedWsUrl
  }, 5000);
}
