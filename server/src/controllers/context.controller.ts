// server/src/controllers/context.controller.ts
import { Request, Response } from 'express';
import { getTokenByUserId } from '../services/dbHelper.js';
import { fetchGitHubPRs } from '../services/github.js';
import { fetchJiraTickets } from '../services/jira.js';
import { fetchSlackThreads } from '../services/slack.js';
import { getAIContextSummary } from '../services/ai/ai.service.js';
import { embeddingService } from '../services/ai/embeddings.service.js';
import { pineconeService } from '../services/vector/pinecone.service.js';

export const getContext = async (req: Request, res: Response) => {
    console.log("DEBUG: Incoming Request Query ->", req.query);
    try {
        const { file, folder, userId,repo } = req.query;

        const targetRepo = (repo as string)|| "";

        if (!userId || typeof userId !== 'string') {
            return res.status(400).json({ error: "User ID is required" });
        }

        const searchTarget = (folder as string) || (file as string) || "";

        if (!searchTarget.trim()) {
            return res.json({
                project: "No file open",
                github: [],
                jira: [],
                slack: [],
                aiSummary: "Open a file to see related project context."
            });
        }
        
        // 1. Fetch all tokens in parallel
        const [githubRecord, jiraRecord, slackRecord,searchVector] = await Promise.all([
            getTokenByUserId(userId, 'github'),
            getTokenByUserId(userId, 'jira'),
            getTokenByUserId(userId, 'slack'),
            embeddingService.generateEmbedding(searchTarget)

        ]);

        


        const [github, jira, slack,historicalContext] = await Promise.all([
            githubRecord?.accessToken 
                ? fetchGitHubPRs(searchTarget, githubRecord.accessToken).catch(err => {
                    console.error("GitHub Fetch Error:", err.message);
                    return []; // Return empty array so the rest of the app works
                }) 
                : Promise.resolve([]),

            jiraRecord?.accessToken 
                ? fetchJiraTickets(searchTarget, jiraRecord.accessToken).catch(err => {
                    console.error("Jira Fetch Error:", err.message);
                    return [];
                }) 
                : Promise.resolve([]),

            slackRecord?.accessToken 
                ? fetchSlackThreads(searchTarget, slackRecord.accessToken).catch(err => {
                    console.error("Slack Fetch Error:", err.message);
                    return [];
                }) 
                : Promise.resolve([]),

                pineconeService.queryContext(searchVector, 3,repo as string)
        ]);

        const uiPRList = [...github, ...historicalContext];

        const filteredHistorical = historicalContext.filter(match => 
            match.metadata?.repository === repo
        );  

        const combinedGithub = [
            ...github,
            ...historicalContext.map(match => ({
                title: match.metadata?.title,
                url: match.metadata?.url,
                isHistorical: true // Flag to show it came from Pinecone
            }))
        ];

        const filteredForAI = uiPRList.filter((pr: any) => {
            const prRepoName = (pr.repo || pr.metadata?.repository || "").toLowerCase();
            const inputRepo = targetRepo.toLowerCase();

    // SMART MATCH: Returns true if the input is "ChatifyApp" AND the PR is "Amanshaikh90/ChatifyApp"
    // or if they match exactly.
            return prRepoName.includes(inputRepo) || inputRepo.includes(prRepoName);
        });

        const githubDisplayData = (combinedGithub.length === 0 && (!repo || repo === "Unknown Project")) 
            ? [{ title: "No GitHub repository linked to this local folder.", isError: true }]
            : combinedGithub;

        // 3. Generate the AI summary using the fetched data (even if some are empty)
        const aiSummary = await getAIContextSummary(
            searchTarget,
            jira,
            filteredForAI,
            slack ,
            targetRepo
        ).catch(err => {
            console.error("AI Summary Generation Error:", err.message);
            return "AI Summary is temporarily unavailable.";
        });

    
        return res.json({
            project: folder || "Unknown Project",
            github:githubDisplayData,
            jira, 
            slack,
            aiSummary
        });

    } catch (err) {
        console.error("Critical Context Controller Error:", err);
        res.status(500).json({ error: "Failed to aggregate context" });
    }
};