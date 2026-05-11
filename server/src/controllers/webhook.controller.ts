import { Request, Response } from 'express';
import { contextService } from '../services/context.service.js';

export const handleGithubWebhook = async (req: Request, res: Response) => {
  const event = req.headers['x-github-event'];
  const payload = req.body;

  try {
    // Check if it's a Pull Request event
    if (event === 'pull_request' && payload.action === 'opened') {
      await contextService.indexGithubPR(payload.pull_request, payload.repository.full_name);
    }

    // Always respond with 200 to GitHub so it knows you received it
    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook Controller Error:", error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
};