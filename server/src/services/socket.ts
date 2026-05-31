import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  repo: string;
}

// userId → list of active connections for that user
const clients = new Map<string, ConnectedClient[]>();

export function setupWebSocketServer(server: HttpServer): void {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket) => {
    let clientInfo: ConnectedClient | null = null;

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        // ── subscribe: the only message type the extension sends ─────────────
        // The userId is a random UUID stored in VS Code globalState — it has
        // no personal data and the WebSocket only sends "please refresh" signals,
        // never raw tokens or user data. So subscribe-based identity is fine here.
        if (message.type === 'subscribe') {
          const { userId, repo } = message.payload || {};

          if (!userId) {
            ws.close(1008, 'Missing userId in subscribe payload');
            return;
          }

          const normalizedRepo = (repo || '').toLowerCase();

          // If this client was already subscribed, update its repo
          if (clientInfo) {
            clientInfo.repo = normalizedRepo;
            console.log(`[WS] Re-subscribed: userId=${userId}, repo=${normalizedRepo || 'all'}`);
            return;
          }

          // First subscription
          clientInfo = { ws, userId, repo: normalizedRepo };

          if (!clients.has(userId)) {
            clients.set(userId, []);
          }
          clients.get(userId)!.push(clientInfo);

          console.log(`[WS] Subscribed: userId=${userId}, repo=${normalizedRepo || 'all'}`);
        }
      } catch (err) {
        console.error('[WS] Failed to parse message:', err);
      }
    });

    ws.on('close', () => {
      if (clientInfo) {
        const remaining = (clients.get(clientInfo.userId) || []).filter(c => c !== clientInfo);
        clients.set(clientInfo.userId, remaining);
        console.log(`[WS] Disconnected: userId=${clientInfo.userId}`);
      }
    });

    ws.on('error', (err) => console.error('[WS] Connection error:', err));
  });

  console.log('[WS] Server ready');
}

/**
 * Broadcast a message to every client watching `repo` (Case 2)
 * AND every client watching '' (Case 1 — global dashboard).
 *
 * Optionally restrict to a specific userId.
 */
export function broadcastToRepo(repo: string, data: any, userId?: string): void {
  const normalizedRepo = (repo || '').toLowerCase();

  for (const [uid, userConnections] of clients.entries()) {
    if (userId && uid !== userId) {continue;}

    for (const client of userConnections) {
      // Send to:
      //  - Case 1 clients (repo = '') — they watch everything
      //  - Case 2 clients that match this repo
      const isGlobalClient = client.repo === '';
      const isMatchingRepo = client.repo === normalizedRepo;

      if (isGlobalClient || isMatchingRepo) {
        if (client.ws.readyState === WebSocket.OPEN) {
          try {
            client.ws.send(JSON.stringify({ type: 'contextUpdate', payload: data }));
          } catch (err) {
            console.error('[WS] Send error:', err);
          }
        }
      }
    }
  }
}
