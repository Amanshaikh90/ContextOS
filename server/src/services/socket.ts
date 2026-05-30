import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { redis } from '../index.js';

interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  repo: string;
}

// Map of userId → connected clients for that user
const clients = new Map<string, ConnectedClient[]>();

/**
 * Generate a short-lived WebSocket auth token for a given userId.
 * Call this from your /api/auth/ws-token endpoint; the extension requests it
 * right before opening the WebSocket connection.
 */
export async function createWsToken(userId: string): Promise<string> {
  const token = `wst_${userId}_${Math.random().toString(36).slice(2)}`;
  // Token expires in 60 seconds — enough time to open the socket and subscribe
  await redis.set(`ws:token:${token}`, userId, 'EX', 60);
  return token;
}

async function validateWsToken(token: string): Promise<string | null> {
  if (!token) {return null;}
  const key = `ws:token:${token}`;
  const userId = await redis.get(key);
  if (userId) {await redis.del(key);} // single-use token
  return userId;
}

export function setupWebSocketServer(server: HttpServer): void {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket) => {
    let clientInfo: ConnectedClient | null = null;
    let authenticated = false;

    // Kick unauthenticated clients after 10 seconds
    const authTimeout = setTimeout(() => {
      if (!authenticated) {
        ws.close(1008, 'Authentication timeout');
      }
    }, 10_000);

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        // ── Step 1: authenticate with a ws-token before anything else ────────
        if (message.type === 'auth') {
          const userId = await validateWsToken(message.token);
          if (!userId) {
            ws.close(1008, 'Invalid or expired token');
            return;
          }
          authenticated = true;
          clearTimeout(authTimeout);
          ws.send(JSON.stringify({ type: 'auth_ok' }));
          console.log(`[WS] Client authenticated: userId=${userId}`);
          return;
        }

        // ── Step 2: only allow subscribe after authentication ─────────────────
        if (!authenticated) {
          ws.close(1008, 'Not authenticated');
          return;
        }

        if (message.type === 'subscribe') {
          const { userId, repo } = message.payload;
          if (!userId) { ws.close(1008, 'Missing userId'); return; }

          const normalizedRepo = (repo || '').toLowerCase();
          clientInfo = { ws, userId, repo: normalizedRepo };

          if (!clients.has(userId)) {clients.set(userId, []);}
          clients.get(userId)!.push(clientInfo);

          console.log(`[WS] Subscribed: userId=${userId}, repo=${normalizedRepo || 'all'}`);
        }
      } catch (err) {
        console.error('[WS] Failed to parse message:', err);
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      if (clientInfo) {
        const remaining = (clients.get(clientInfo.userId) || []).filter(c => c !== clientInfo);
        clients.set(clientInfo.userId, remaining);
        console.log(`[WS] Disconnected: userId=${clientInfo.userId}`);
      }
    });

    ws.on('error', (err) => console.error('[WS] Error:', err));
  });
}

export function broadcastToRepo(repo: string, data: any, userId?: string): void {
  const normalizedRepo = (repo || '').toLowerCase();

  for (const [uid, userConnections] of clients.entries()) {
    if (userId && uid !== userId) {continue;}

    for (const client of userConnections) {
      if (client.repo === '' || client.repo === normalizedRepo) {
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
