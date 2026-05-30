import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Redis } from 'ioredis';
import authRoutes from './routes/auth.js';
import contextRoutes from './routes/context.js';
import http from 'http';
import { setupWebSocketServer } from './services/socket.js';

const app = express();
export const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

// ── Security headers via Helmet ─────────────────────────────────────────────
// Sets: X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security,
// Content-Security-Policy, X-XSS-Protection, Referrer-Policy, and more.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Railway doesn't require COEP
}));

// ── CORS: allow only the VSCode webview origin and your frontend ─────────────
// VSCode WebViews use a vscode-webview:// scheme. For Railway, lock this to
// your actual domain. Never use '*' in production.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (same-origin, curl, Postman in dev)
    if (!origin) {return callback(null, true);}
    // Allow any VSCode webview origin
    if (origin.startsWith('vscode-webview://')) {return callback(null, true);}
    // Allow explicitly listed origins from env
    if (ALLOWED_ORIGINS.includes(origin)) {return callback(null, true);}
    callback(new Error(`CORS policy: origin ${origin} is not allowed`));
  },
  credentials: true,
}));

// ── Raw body preservation for webhook HMAC validation ───────────────────────
app.use(express.json({
  verify: (req: any, _res, buf) => { req.rawBody = buf; },
}));

// ── Global rate limiter (protects all routes) ────────────────────────────────
// 100 requests per 15 minutes per IP — adjust as needed.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(globalLimiter);

// ── Stricter limiter for auth routes ────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,                   // 20 OAuth attempts per IP per hour
  message: { error: 'Too many authentication attempts.' },
});
app.use('/api/auth', authLimiter);

// ── Redis connection events ──────────────────────────────────────────────────
redis.on('connect', () => console.log('[Redis] Connected'));
redis.on('error', (err) => console.error('[Redis] Error:', err));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/context', contextRoutes);
app.use('/api', contextRoutes);

// ── Health check (no auth required, no rate limiting needed here) ────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Global error handler (never leak stack traces to the client) ─────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const statusCode = err.status || 500;
  // Only log full error server-side; never send stack to client
  console.error('[Unhandled error]', err);
  res.status(statusCode).json({
    error: statusCode === 500 ? 'Internal server error' : err.message,
  });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`[Server] Running on port ${PORT}`);
});
setupWebSocketServer(server);
