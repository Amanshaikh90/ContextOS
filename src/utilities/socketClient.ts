import WebSocket from 'ws';

type MessageHandler = (data: any) => void;

let ws: WebSocket | null = null;
let userId: string;
let currentRepo: string;
let onMessage: MessageHandler;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Establish a WebSocket connection to the backend.
 */
export function connectSocket(
  uid: string,
  repo: string,
  handler: MessageHandler
): void {
  userId = uid;
  currentRepo = repo;
  onMessage = handler;

  // Close any existing connection before opening a new one.
  if (ws) {
    ws.close();
  }

  try {
    ws = new WebSocket('wss://contextos-production.up.railway.app');

    ws.on('open', () => {
      console.log('[WS Client] Connected');
      sendSubscribe();
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
    });

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'contextUpdate') {
          onMessage(message.payload);
        }
      } catch (err) {
        console.error('[WS Client] Failed to parse message:', err);
      }
    });

    ws.on('error', (err) => {
      console.error('[WS Client] Error:', err);
    });

    ws.on('close', () => {
      console.log('[WS Client] Disconnected. Reconnecting in 5 seconds...');
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
        payload: {
          userId,
          repo: currentRepo,
        },
      })
    );
  }
}

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
    ws.close();
    ws = null;
  }
}

function scheduleReconnect(): void {
  if (reconnectTimeout) {return;}
  reconnectTimeout = setTimeout(() => {
    connectSocket(userId, currentRepo, onMessage);
  }, 5000);
}