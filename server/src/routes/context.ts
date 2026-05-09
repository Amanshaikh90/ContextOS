import { Router, Request, Response } from 'express';
import { getTokenByUserId } from '../services/dbHelper.js';
import { fetchGitHubPRs } from '../services/github.js';
import { fetchSlackThreads } from '../services/slack.js';
import { fetchJiraTickets } from '../services/jira.js';

const router: Router = Router();

router.get('/', async (req: Request, res: Response) => {
    const { userId, file } = req.query;

    if (!userId) {
        return res.status(400).json({ error: "userId is required" });
    }

    try {
        const [ghToken, jiraToken, slackToken] = await Promise.all([
            getTokenByUserId(userId as string, 'github'),
            getTokenByUserId(userId as string, 'jira'),
            getTokenByUserId(userId as string, 'slack')
        ]);

        const [github, jira, slack] = await Promise.all([
            ghToken 
                ? fetchGitHubPRs(file as string, ghToken.accessToken).catch(() => []) 
                : Promise.resolve([]),
            jiraToken 
                ? fetchJiraTickets(file as string, jiraToken.accessToken).catch(() => []) 
                : Promise.resolve([]),
            slackToken 
                ? fetchSlackThreads(file as string, slackToken.accessToken).catch(() => []) 
                : Promise.resolve([])
        ]);

        res.json({ github, jira, slack });
    } catch (error) {
        console.error("Context Master Error:", error);
        res.status(500).json({ error: "Failed to aggregate context" });
    }
});

export default router;