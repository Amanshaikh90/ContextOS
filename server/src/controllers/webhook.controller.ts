import { Request, Response } from 'express';
import { contextService } from '../services/context.service.js';
import crypto from 'crypto';

export const handleGithubWebhook = async (req: Request, res: Response) => {
  const signature = req.headers['x-hub-signature-256'] as string;
  const event = req.headers['x-github-event'];
  const rawBody = (req as any).rawBody;

  

  if (!signature || !rawBody) {
    console.error("Critical Error: Missing signature header or rawBody buffer.");
    return res.status(401).send("Unauthorized: Missing Security Data");
  }

  // 1. Signature Verification
  // Ensure GITHUB_WEBHOOK_SECRET is the literal string (e.g., ContextOS_Secret123$)
  const secret = process.env.GITHUB_WEBHOOK_SECRET || '';
  const hmac = crypto.createHmac('sha256', secret);
  
  // Calculate the digest from the raw buffer
  const calculatedDigest = 'sha256=' + hmac.update(rawBody).digest('hex');

  // Log comparison for manual verification in Docker logs
  if (signature !== calculatedDigest) {
    console.error("❌ Invalid Webhook Signature");
    console.error("Expected from GitHub:  ", signature);
    console.error("Calculated by Server: ", calculatedDigest);
    return res.status(401).send("Unauthorized: Invalid Signature");
  }

  

  try {
    const payload = req.body;

    // 2. Handle PR updates (For AI context)
    if (event === 'pull_request') {
      if (['opened', 'closed', 'reopened'].includes(payload.action)) {
        await contextService.indexGithubPR(payload.pull_request, payload.repository.name);
      }
    }

    // 3. Handle App Installations
    if (event === 'installation') {
        console.log(`App ${payload.action} by ${payload.sender.login}`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Webhook Logic Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};