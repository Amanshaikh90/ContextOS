import { Request, Response } from 'express';
import { getContextForUser } from '../services/contextBuilder.js';

export const getContext = async (req: Request, res: Response) => {
  try {
    const { userId, repo, refresh } = req.query;
    const isRefresh = refresh === 'true';
    const skipAI = req.query.skipAI === 'true';

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const data = await getContextForUser(
      userId,
      repo as string,
      isRefresh,
      skipAI
    );

    return res.json(data);
  } catch (err) {
    console.error('Critical Unhandled Context Fallback Hit:', err);
    res.status(200).json({
      project: 'Context OS Recovery Module',
      repo: '',
      github: [],
      jira: [],
      slack: [],
      aiSummary: 'An unexpected error occurred while parsing active workflows.',
    });
  }
};