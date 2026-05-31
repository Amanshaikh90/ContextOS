import { Router, Request, Response } from 'express';
import { createUser, saveToken, getTokenByUserId, deleteToken } from '../services/dbHelper.js';
import { redis } from '../index.js';
import axios from 'axios';
import crypto from 'crypto';

const router: Router = Router();

// ── BASE_URL must come from env — never hardcode ngrok or production URLs ─────
// In .env: BASE_URL=https://contextos-production.up.railway.app/api (prod)
//          BASE_URL=https://your-ngrok-url.ngrok-free.app/api     (local dev)
const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) {throw new Error('[FATAL] BASE_URL env var is required.');}

// ── CSRF state helpers ────────────────────────────────────────────────────────
// The OAuth `state` param carries a random nonce (NOT the userId).
// We store userId → nonce in Redis (TTL 10 min) and verify on callback.
// This prevents CSRF and stops userId from appearing in browser URLs/logs.

const STATE_TTL = 600; // 10 minutes in seconds

async function createState(userId: string): Promise<string> {
  const nonce = crypto.randomBytes(24).toString('hex');
  await redis.set(`oauth:state:${nonce}`, userId, 'EX', STATE_TTL);
  return nonce;
}

async function consumeState(nonce: string): Promise<string | null> {
  const key = `oauth:state:${nonce}`;
  const userId = await redis.get(key);
  if (userId) {await redis.del(key);} // single-use
  return userId;
}

// ── /auth/init ────────────────────────────────────────────────────────────────
router.post('/init', async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email is required' });
  }
  try {
    const user = await createUser(email);
    res.json({ success: true, user });
  } catch {
    res.status(500).json({ error: 'Failed to sync user' });
  }
});

// ── /auth/token ───────────────────────────────────────────────────────────────
router.post('/token', async (req, res) => {
  const { userId, provider, accessToken } = req.body;
  if (!userId || !provider || !accessToken) {
    return res.status(400).json({ error: 'userId, provider, and accessToken are required' });
  }
  try {
    const entry = await saveToken(userId, provider, accessToken);
    res.json({ success: true, entry });
  } catch {
    res.status(500).json({ error: 'Failed to save token' });
  }
});

// ── GitHub OAuth ──────────────────────────────────────────────────────────────
router.get('/github', async (req: Request, res: Response) => {
  const targetUserId = req.query.userId as string;
  if (!targetUserId) {return res.status(400).send('userId is required');}

  try {
    const record = await getTokenByUserId(targetUserId, 'github');

    if (record?.accessToken) {
      // Validate the stored token is still alive on GitHub
      const check = await fetch('https://api.github.com/user', {
        headers: { Authorization: `token ${record.accessToken}`, Accept: 'application/json' },
      });
      if (check.status === 401) {
        await deleteToken(targetUserId, 'github');
      } else {
        // Token is healthy — go straight to OAuth (skip App installation drawer)
        const nonce = await createState(targetUserId);
        const params = new URLSearchParams({
          client_id: process.env.GITHUB_CLIENT_ID!,
          redirect_uri: `${BASE_URL}/auth/github/callback`,
          state: nonce, // ← nonce, NOT userId
        });
        return res.redirect(`https://github.com/login/oauth/authorize?${params}`);
      }
    }

    // New user or revoked token — route to App installation first
    const nonce = await createState(targetUserId);
    return res.redirect(
      `https://github.com/apps/ContextOS-Beta/installations/new?state=${nonce}`
    );
  } catch (err) {
    console.error('[Auth/GitHub] Error:', err);
    const nonce = await createState(targetUserId);
    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID!,
      redirect_uri: `${BASE_URL}/auth/github/callback`,
      state: nonce,
    });
    return res.redirect(`https://github.com/login/oauth/authorize?${params}`);
  }
});

router.get('/github/callback', async (req: Request, res: Response) => {
  const { code, state: nonce } = req.query;

  if (!code || !nonce) {return res.status(400).send('Missing code or state');}

  // ── CSRF check: resolve nonce → userId ───────────────────────────────────
  const userId = await consumeState(nonce as string);
  if (!userId) {
    console.warn('[Auth/GitHub] Invalid or expired state nonce — possible CSRF attempt.');
    return res.status(403).send('Invalid or expired state. Please try connecting again.');
  }

  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${BASE_URL}/auth/github/callback`,
      }),
    });
    const data: any = await tokenRes.json();

    if (data.error) {return res.status(400).json(data);}

    await saveToken(userId, 'github', data.access_token);
    res.send('<h1>GitHub Connected! You can close this window and return to VS Code.</h1>');
  } catch (err) {
    console.error('[Auth/GitHub] Callback error:', err);
    res.status(500).send('Authentication failed');
  }
});

// ── Jira OAuth ────────────────────────────────────────────────────────────────
router.get('/jira', async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) {return res.status(400).send('userId is required');}

  const nonce = await createState(userId);
  const scopes = encodeURIComponent('read:jira-work read:jira-user offline_access');
  const redirectUri = encodeURIComponent(process.env.JIRA_CALLBACK_URL!);
  const authUrl = `https://auth.atlassian.com/authorize?audience=api.atlassian.com&client_id=${process.env.JIRA_CLIENT_ID}&scope=${scopes}&redirect_uri=${redirectUri}&state=${nonce}&response_type=code&prompt=consent`;
  res.redirect(authUrl);
});

router.get('/jira/callback', async (req: Request, res: Response) => {
  const { code, state: nonce } = req.query;
  if (!code || !nonce) {return res.status(400).json({ error: 'Missing code or state' });}

  const userId = await consumeState(nonce as string);
  if (!userId) {
    return res.status(403).send('Invalid or expired state. Please reconnect Jira.');
  }

  try {
    const response = await axios.post('https://auth.atlassian.com/oauth/token', {
      grant_type: 'authorization_code',
      client_id: process.env.JIRA_CLIENT_ID,
      client_secret: process.env.JIRA_CLIENT_SECRET,
      code,
      redirect_uri: process.env.JIRA_CALLBACK_URL,
    });

    const { access_token, refresh_token } = response.data;

    const resourcesRes = await axios.get(
      'https://api.atlassian.com/oauth/token/accessible-resources',
      { headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' } }
    );

    if (!resourcesRes.data || resourcesRes.data.length === 0) {
      return res.send(`
        <div style="font-family:-apple-system,sans-serif;text-align:center;padding:50px 20px">
          <h1>Install Required</h1>
          <p>The contextOS app hasn't been added to your Jira workspace yet.</p>
          <a href="https://marketplace.atlassian.com/apps/YOUR_APP_ID/contextos" target="_blank">
            Install from Marketplace
          </a>
        </div>
      `);
    }

    await saveToken(userId, 'jira', access_token,refresh_token);
    res.send('<h1>Jira Connected! You can close this window.</h1>');
  } catch (err) {
    console.error('[Auth/Jira] Callback error:', err);
    res.status(500).send('Authentication failed');
  }
});

// ── Slack OAuth ───────────────────────────────────────────────────────────────
router.get('/slack', async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) {return res.status(400).send('userId is required');}

  const nonce = await createState(userId);
  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID!,
    user_scope: 'search:read,channels:read,groups:read',
    redirect_uri: process.env.SLACK_CALLBACK_URL!,
    state: nonce,
  });
  res.redirect(`https://slack.com/oauth/v2/authorize?${params}`);
});

router.get('/slack/callback', async (req: Request, res: Response) => {
  const { code, state: nonce, error } = req.query;
  if (error) {return res.status(400).send(`Slack Access Denied: ${error}`);}
  if (!code || !nonce) {return res.status(400).send('Missing code or state');}

  const userId = await consumeState(nonce as string);
  if (!userId) {
    return res.status(403).send('Invalid or expired state. Please reconnect Slack.');
  }

  try {
    const response = await axios.post('https://slack.com/api/oauth.v2.access', null, {
      params: {
        client_id: process.env.SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET,
        code,
        redirect_uri: process.env.SLACK_CALLBACK_URL,
      },
    });

    if (!response.data.ok) {throw new Error(response.data.error || 'Slack API error');}

    const accessToken = response.data.authed_user?.access_token;
    if (!accessToken) {throw new Error('No user access token received');}

    await saveToken(userId, 'slack', accessToken);
    res.send('<h1>Slack Connected! You can return to VS Code.</h1>');
  } catch (err: any) {
    console.error('[Auth/Slack] Callback error:', err.response?.data || err.message);
    res.status(500).send('Failed to complete Slack authentication.');
  }
});

export default router;
