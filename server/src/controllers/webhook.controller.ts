import { Request, Response } from 'express';
import { contextService } from '../services/context.service.js';
import { broadcastToRepo } from '../services/socket.js';
import crypto from 'crypto';

export const handleGithubWebhook = async (req: Request, res: Response) => {
  const signature = req.headers['x-hub-signature-256'] as string;
  const event = req.headers['x-github-event'] as string;
  const rawBody = (req as any).rawBody as Buffer;

  // ── Guard: reject early if signature or body is missing ─────────────────
  if (!signature || !rawBody) {
    console.error('[Webhook] Missing signature header or raw body.');
    return res.status(401).send('Unauthorized');
  }

  // ── Guard: webhook secret MUST be set in env — never allow empty string ──
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[Webhook] GITHUB_WEBHOOK_SECRET is not configured. Rejecting all webhook calls.');
    return res.status(500).send('Webhook not configured');
  }

  // ── HMAC validation ──────────────────────────────────────────────────────
  const hmac = crypto.createHmac('sha256', secret);
  const calculatedDigest = 'sha256=' + hmac.update(rawBody).digest('hex');

  // CRITICAL: timingSafeEqual prevents timing attacks that leak the secret
  // via response-time differences between correct/incorrect bytes.
  let signatureValid = false;
  try {
    signatureValid = crypto.timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(calculatedDigest, 'utf8')
    );
  } catch {
    // timingSafeEqual throws if buffers have different lengths — that itself means mismatch
    signatureValid = false;
  }

  if (!signatureValid) {
    console.warn('[Webhook] Invalid signature — request rejected.');
    return res.status(401).send('Unauthorized: Invalid signature');
  }

  // ── Process the verified event ────────────────────────────────────────────
  try {
    const payload = req.body;
    const userId = (req.query.userId as string) || 'global-system-fallback';

    if (event === 'pull_request') {
      const action = payload.action as string;
      if (['opened', 'closed', 'reopened'].includes(action)) {
        await contextService.indexGithubPR(
          payload.pull_request,
          payload.repository.name,
          userId
        );

        broadcastToRepo(
          payload.repository.full_name,
          { refresh: true, repo: payload.repository.full_name }
        );

        console.log(`[Webhook] PR ${action} — broadcasted update for ${payload.repository.full_name}`);
      }
    }

    if (event === 'installation') {
      console.log(`[Webhook] App ${payload.action} by ${payload.sender.login}`);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[Webhook] Processing error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
