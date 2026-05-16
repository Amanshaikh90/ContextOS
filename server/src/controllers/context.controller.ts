// server/src/controllers/context.controller.ts
import { Request, Response } from 'express';
import { getTokenByUserId } from '../services/dbHelper.js';
import { fetchGitHubPRs } from '../services/github.js';
import { fetchJiraTickets } from '../services/jira.js';
import { fetchSlackThreads } from '../services/slack.js';
import { getAIContextSummary } from '../services/ai/ai.service.js';
import { embeddingService } from '../services/ai/embeddings.service.js';
import { pineconeService } from '../services/vector/pinecone.service.js';
import { contextCache } from '../cache.js';

export const getContext = async (req: Request, res: Response) => {
    try {
        const { file, folder, userId, repo, refresh } = req.query;
        const isRefresh = refresh === 'true';
        const targetRepo = (repo as string) || "";

        if (!userId || typeof userId !== 'string') {
            return res.status(400).json({ error: "User ID is required" });
        }

        const searchTarget = (folder as string) || (file as string) || "";
        if (!searchTarget.trim()) {
            return res.json({
                project: "No file open",
                github: [], jira: [], slack: [],
                aiSummary: "Open a file to see related project context."
            });
        }

        const cacheKey = `context:${userId}:${targetRepo}:${searchTarget}`;
        const cachedData = await contextCache.getContext(cacheKey);

        if (cachedData && !isRefresh) {
            return res.json(cachedData);
        }
        
        // 1. Parallel Fetch: Tokens & The Search Vector (Only once!)
        const [githubRecord, jiraRecord, slackRecord, searchVector] = await Promise.all([
            getTokenByUserId(userId, 'github'),
            getTokenByUserId(userId, 'jira'),
            getTokenByUserId(userId, 'slack'),
            embeddingService.generateEmbedding(searchTarget) // Generated once
        ]);

        // 2. Parallel Fetch: External APIs + Pinecone
        const [github, jira, slack, historicalContext] = await Promise.all([
            githubRecord?.accessToken 
                ? fetchGitHubPRs(searchTarget, githubRecord.accessToken, targetRepo).catch(() => []) 
                : Promise.resolve([]),

            jiraRecord?.accessToken 
                ? fetchJiraTickets(searchTarget, jiraRecord.accessToken, userId).catch(() => []) 
                : Promise.resolve([]),

            slackRecord?.accessToken 
                ? fetchSlackThreads(searchTarget, slackRecord.accessToken).catch(() => []) 
                : Promise.resolve([]),

            pineconeService.queryContext(searchVector, 3, targetRepo).catch(() => [])
        ]);

        // 3. Unify Live + Historical PRs
        const combinedGithub = [
            ...github,
            ...historicalContext.map((match: any) => ({
                id: match.id,
                title: match.metadata?.title,
                url: match.metadata?.url,
                repo: match.metadata?.repository,
                status: 'merged', 
                isHistorical: true 
            }))
        ];

        // 4. Smart Filter for AI Context
        const filteredForAI = combinedGithub.filter((pr: any) => {
            const prRepoName = (pr.repo || "").toLowerCase();
            const inputRepo = targetRepo.toLowerCase();
            return prRepoName.includes(inputRepo) || inputRepo.includes(prRepoName);
        });

        // 5. Handle AI Summary Logic
        let aiSummary;
        if (isRefresh && cachedData) {
            aiSummary = cachedData.aiSummary;
        } else {
            try {
                aiSummary = await getAIContextSummary(
                    searchTarget,
                    jira,
                    filteredForAI, // AI now sees the unified list
                    slack,
                    targetRepo
                );
            } catch (err) {
                aiSummary = cachedData?.aiSummary || "Summary unavailable.";
            }
        }
        
        const responseData = {
            project: folder || "Unknown Project",
            github: combinedGithub.length === 0 && !targetRepo ? 
                    [{ title: "No repository linked.", isError: true }] : combinedGithub,
            jira: isRefresh ? (cachedData?.jira || jira) : jira,
            slack: isRefresh ? (cachedData?.slack || slack) : slack,
            aiSummary
        };

        await contextCache.setContext(cacheKey, responseData);
        return res.json(responseData);

    } catch (err) {
        console.error("Critical Context Controller Error:", err);
        res.status(500).json({ error: "Failed to aggregate context" });
    }
};