import { getTokenByUserId } from './dbHelper.js';
import { fetchGitHubPRs } from './github.js';
import { fetchJiraTickets } from './jira.js';
import { fetchSlackThreads } from './slack.js';
import { getAIContextSummary } from './ai/ai.service.js';
import { embeddingService } from './ai/embeddings.service.js';
import { pineconeService } from './vector/pinecone.service.js';
import { contextCache } from '../cache.js';

export async function getContextForUser(
  userId: string,
  repo: string = '',
  refresh: boolean = false,
  skipAI: boolean = false
): Promise<any> {
  const targetRepo = repo.trim();
  const cleanRepoKey = targetRepo ? targetRepo.toLowerCase() : 'none';
  const cacheKey = `context:${userId}:${cleanRepoKey}`;

  const cachedData = refresh ? null : await contextCache.getContext(cacheKey);
  if (cachedData && !refresh) {
    const cachedRepo = cachedData.repo || '';
    if (cachedRepo.toLowerCase() === targetRepo.toLowerCase()) {
      console.log(`[Cache Hit] Returning cached context for ${cacheKey}`);
      return cachedData;
    }
  }

  const [githubRecord, jiraRecord, slackRecord] = await Promise.all([
    getTokenByUserId(userId, 'github').catch(() => null),
    getTokenByUserId(userId, 'jira').catch(() => null),
    getTokenByUserId(userId, 'slack').catch(() => null),
  ]);

  const [github, jira, slack, historicalContext] = await Promise.all([
    githubRecord?.accessToken
      ? fetchGitHubPRs('', githubRecord.accessToken, targetRepo).catch(() => [])
      : [],
    jiraRecord?.accessToken
      ? fetchJiraTickets(targetRepo || 'Global Dashboard', jiraRecord.accessToken, userId).catch(() => [])
      : [],
    slackRecord?.accessToken
      ? fetchSlackThreads(targetRepo || 'Global Dashboard', slackRecord.accessToken).catch(() => [])
      : [],
    targetRepo
      ? embeddingService.generateEmbedding(targetRepo)
          .then(vector => vector ? pineconeService.queryContext(vector, 5, targetRepo, userId) : [])
          .catch(() => [])
      : [],
  ]);

  
  let finalHistoricalContext = [...historicalContext];

  if (targetRepo && historicalContext.length === 0 && github.length > 0) {
    console.log(`[Backfill] No vectors found for user ${userId}. Auto-indexing up to 5 recent PRs.`);
    try {
      
      const { contextService } = await import('./context.service.js');
      
      
      const prsToBackfill = github.slice(0, 5);
      
      for (const pr of prsToBackfill) {
        await contextService.indexGithubPR(
          {
            id: pr.id,
            title: pr.title,
            body: `Status: ${pr.status || 'open'}. URL reference: ${pr.url || ''}`,
            html_url: pr.url
          },
          targetRepo,
          userId
        );
      }

      
      const freshVector = await embeddingService.generateEmbedding(targetRepo);
      if (freshVector) {
        finalHistoricalContext = await pineconeService.queryContext(freshVector, 5, targetRepo, userId);
      }
    } catch (backfillError) {
      console.error("[Backfill Module Recovery] Intercepted error during synchronization:", backfillError);
    }
  }

  const livePRs = github.map((pr: any) => ({
    id: `live-${pr.id || Math.random()}`,
    title: pr.title || 'Untitled PR',
    url: pr.url || '#',
    repo: pr.repo || 'Unknown',
    status: pr.status || 'open',
  }));

  
  const mappedHistorical = finalHistoricalContext.map((match: any) => ({
    id: `hist-${match.id || Math.random()}`,
    title: match.metadata?.title || 'Untitled Historical PR',
    url: match.metadata?.url || '#',
    repo: match.metadata?.short_repo || match.metadata?.repository || '',
    status: 'merged',
    isHistorical: true,
  }));

  const filterByRepo = (pr: any) => {
    if (!targetRepo) return true;
    const cleanTarget = targetRepo.toLowerCase();
    const targetNameOnly = cleanTarget.includes('/') ? cleanTarget.split('/').pop() : cleanTarget;
    const prRepo = (pr.repo || '').toLowerCase();
    const prNameOnly = prRepo.includes('/') ? prRepo.split('/').pop() : prRepo;
    return prRepo === cleanTarget || prNameOnly === targetNameOnly;
  };

  const combinedGithub = [...livePRs, ...mappedHistorical].filter(filterByRepo);

  let aiSummary = '';
  if (skipAI) {
    aiSummary = cachedData?.aiSummary || 'Summary metrics synchronized.';
  } else if (refresh && cachedData) {
    aiSummary = cachedData.aiSummary;
  } else {
    try {
      aiSummary = await getAIContextSummary(
        targetRepo ? `Repository: ${targetRepo}` : 'Global Dashboard',
        jira || [],
        combinedGithub,
        slack || [],
        targetRepo || 'All Repositories'
      );
    } catch {
      aiSummary = cachedData?.aiSummary || 'Summary metrics ready below.';
    }
  }

  const responseData = {
    project: targetRepo || 'All Workspaces',
    repo: targetRepo,
    github: combinedGithub,
    jira: jira || [],
    slack: slack || [],
    aiSummary,
  };

  if (!skipAI) {
    await contextCache.setContext(cacheKey, responseData);
  }

  return responseData;
}