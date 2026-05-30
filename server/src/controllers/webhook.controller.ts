import { Request, Response } from 'express';
import { contextService } from '../services/context.service.js';
import { broadcastToRepo } from '../services/socket.js';
import crypto from 'crypto';
import { redis } from '../index.js';        

export const handleGithubWebhook = async (req: Request, res: Response) => {
  const signature = req.headers['x-hub-signature-256'] as string;
  const event = req.headers['x-github-event'];
  const rawBody = (req as any).rawBody;

  if (!signature || !rawBody) {
    console.error('Critical Error: Missing signature header or rawBody buffer.');
    return res.status(401).send('Unauthorized: Missing Security Data');
  }

  const secret = process.env.GITHUB_WEBHOOK_SECRET || '';
  const hmac = crypto.createHmac('sha256', secret);
  const calculatedDigest = 'sha256=' + hmac.update(rawBody).digest('hex');

  if (signature !== calculatedDigest) {
    console.error('❌ Invalid Webhook Signature');
    console.error('Expected from GitHub:  ', signature);
    console.error('Calculated by Server: ', calculatedDigest);
    return res.status(401).send('Unauthorized: Invalid Signature');
  }

  try {
    const payload = req.body;
    const { userId } = req.query;
    const trackingUser = (userId as string) || 'global-system-fallback';

    // Handle PR events
    if (event === 'pull_request') {
      const action = payload.action;
      if (['opened', 'closed', 'reopened'].includes(action)) {
        // Index the PR in Pinecone
        await contextService.indexGithubPR(
          payload.pull_request,
          payload.repository.name,
          trackingUser
        );

        // Broadcast refresh signal to all connected clients
        broadcastToRepo(payload.repository.full_name, { refresh: true, repo: payload.repository.full_name });

        // ✅ NEW: Invalidate all cached contexts for this repository
        const repoLower = payload.repository.full_name.toLowerCase();
        const keys = await redis.keys(`context:*:${repoLower}`);
        if (keys.length > 0) {
          await redis.del(...keys);
          console.log(`[Webhook] Invalidated ${keys.length} cache entries for repo: ${repoLower}`);
        }

        console.log(`[Webhook] Broadcasted updated context for repo: ${payload.repository.full_name}`);
      }
    }

    // Handle App installation events (no broadcast needed)
    if (event === 'installation') {
      console.log(`App ${payload.action} by ${payload.sender.login}`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook Logic Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};