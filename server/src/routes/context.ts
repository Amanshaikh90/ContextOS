import { Router, Request, Response } from 'express';
import { getTokenByUserId } from '../services/dbHelper.js';
import { fetchGitHubPRs } from '../services/github.js';
import { fetchSlackThreads } from '../services/slack.js';
import { fetchJiraTickets } from '../services/jira.js';

const router: Router = Router();

router.get('/', async (req: Request, res: Response) => {
    const { userId, file, folder } = req.query;

    if (!userId) {
        return res.status(400).json({ error: "userId is required" });
    }

    try {
        // 1. Fetch all tokens in parallel
        const [ghToken, jiraToken, slackToken] = await Promise.all([
            getTokenByUserId(userId as string, 'github'),
            getTokenByUserId(userId as string, 'jira'),
            getTokenByUserId(userId as string, 'slack')
        ]);

        // 2. Fetch context from services using the FOLDER name for broader context
        // We prioritize the 'folder' for the search query to get all related tasks
        const searchTarget = (folder as string) || (file as string) || "";

        const [github, jira, slack] = await Promise.all([
            ghToken 
                ? fetchGitHubPRs(searchTarget, ghToken.accessToken).catch(e => {
                    console.error("GitHub Service Error:", e.message);
                    return []; // Graceful degradation
                }) 
                : [],
            jiraToken 
                ? fetchJiraTickets(searchTarget, jiraToken.accessToken).catch(e => {
                    console.error("Jira Service Error:", e.message);
                    return [];
                }) 
                : [],
            slackToken 
                ? fetchSlackThreads(searchTarget, slackToken.accessToken).catch(e => {
                    console.error("Slack Service Error:", e.message);
                    return [];
                }) 
                : []
        ]);

        console.log("--- contextOS Debug Start ---");
console.log("User ID:", userId);
console.log("Search Target (File/Folder):", searchTarget);
console.log("GitHub Results Count:", github.length);
console.log("Jira Results Count:", jira.length);
console.log("Slack Results Count:", slack.length);
console.log("Full Data Payload:", JSON.stringify({ github, jira, slack }, null, 2));
console.log("--- contextOS Debug End ---");

        res.json({ 
            project: folder || "Unknown Project",
            github, 
            jira, 
            slack 
        });

    } catch (error) {
        console.error("Critical Context Aggregation Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;