import { getTokenByUserId } from './dbHelper.js';
import { fetchGitHubPRs, checkGitHubInstallation } from './github.js'; // Imported validation step
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

  // ── Cache read ──────────────────────────────────────────────────────────────
  // Skip cache on explicit refresh (triggered by webhook or manual button).
  const cachedData = refresh ? null : await contextCache.getContext(cacheKey);
  if (cachedData) {
    const cachedRepo = cachedData.repo || '';
    if (cachedRepo.toLowerCase() === targetRepo.toLowerCase()) {
      console.log(`[Cache Hit] ${cacheKey}`);
      return cachedData;
    }
  }

  // ── Bust cross-case caches on a live refresh ────────────────────────────────
  if (refresh) {
    await contextCache.bustLiveUpdate(userId, targetRepo || undefined);
  }

  // ── Fetch tokens for all integrations in parallel ───────────────────────────
  const [githubRecord, jiraRecord, slackRecord] = await Promise.all([
    getTokenByUserId(userId, 'github').catch((e) => {
      console.error(`[contextBuilder] GitHub token error for userId=${userId}:`, e.message);
      return null;
    }),
    getTokenByUserId(userId, 'jira').catch((e) => {
      console.error(`[contextBuilder] Jira token error for userId=${userId}:`, e.message);
      return null;
    }),
    getTokenByUserId(userId, 'slack').catch((e) => {
      console.error(`[contextBuilder] Slack token error for userId=${userId}:`, e.message);
      return null;
    }),
  ]);

  // ── NEW: Dynamic validation check for authentic app installation state ──
  const githubToken = githubRecord?.accessToken;
  let isAppInstalled = false;
  if (githubToken) {
    isAppInstalled = await checkGitHubInstallation(githubToken);
  }

  // Track which services have a working token so the frontend can show reconnect prompts
  const authStatus = {
    github: !!githubToken,
    githubAppInstalled: isAppInstalled, // Dynamic safety flag exposed cleanly here
    jira:   !!jiraRecord?.accessToken,
    slack:  !!slackRecord?.accessToken,
  };
  
  if (!authStatus.github) {
    console.warn(`[contextBuilder] GitHub token missing/invalid for userId=${userId} — PRs will be empty.`);
  }

  // ── Fetch live data + historical vector context in parallel ─────────────────
  const [github, jira, slack, historicalContext] = await Promise.all([
    githubToken
      ? fetchGitHubPRs('', githubToken, targetRepo).catch(() => [])
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

  // ── Auto-backfill Pinecone if no vectors exist for this repo ─────────────────
  let finalHistoricalContext = [...historicalContext];
  if (targetRepo && historicalContext.length === 0 && github.length > 0) {
    console.log(`[Backfill] No vectors for userId=${userId}. Indexing ${Math.min(github.length, 5)} PRs.`);
    try {
      const { contextService } = await import('./context.service.js');
      for (const pr of github.slice(0, 5)) {
        await contextService.indexGithubPR(
          { id: pr.id, title: pr.title, body: `Status: ${pr.status || 'open'}. URL: ${pr.url || ''}`, html_url: pr.url },
          targetRepo,
          userId
        );
      }
      const freshVector = await embeddingService.generateEmbedding(targetRepo);
      if (freshVector) {
        finalHistoricalContext = await pineconeService.queryContext(freshVector, 5, targetRepo, userId);
      }
    } catch (backfillError) {
      console.error('[Backfill] Error:', backfillError);
    }
  }

  // ── Shape live PRs ──────────────────────────────────────────────────────────
  const livePRs = github.map((pr: any) => ({
    id: `live-${pr.id || Math.random()}`,
    title: pr.title || 'Untitled PR',
    url: pr.url || '#',
    repo: pr.repo || 'Unknown',
    status: pr.status || 'open',
  }));

  // ── Shape historical PRs from Pinecone ──────────────────────────────────────
  const mappedHistorical = finalHistoricalContext.map((match: any) => ({
    id: `hist-${match.id || Math.random()}`,
    title: match.metadata?.title || 'Untitled Historical PR',
    url: match.metadata?.url || '#',
    repo: match.metadata?.short_repo || match.metadata?.repository || '',
    status: 'merged',
    isHistorical: true,
  }));

  // ── Filter by repo (Case 2) or pass all (Case 1) ────────────────────────────
  const filterByRepo = (pr: any) => {
    if (!targetRepo || targetRepo.trim() === '' || targetRepo.toLowerCase() === 'none') {
      return true;
    }
    const cleanTarget = targetRepo.toLowerCase();
    const targetNameOnly = cleanTarget.includes('/') ? cleanTarget.split('/').pop() : cleanTarget;
    const prRepo = (pr.repo || '').toLowerCase();
    const prNameOnly = prRepo.includes('/') ? prRepo.split('/').pop() : prRepo;
    return prRepo === cleanTarget || prNameOnly === targetNameOnly;
  };

  const combinedGithub = [...livePRs, ...mappedHistorical].filter(filterByRepo);

  // ── AI summary ──────────────────────────────────────────────────────────────
  let aiSummary = '';
  if (skipAI) {
    aiSummary = cachedData?.aiSummary || '';
  } else if (refresh && cachedData) {
    aiSummary = cachedData.aiSummary;
  }

  if (!aiSummary) {
    try {
      aiSummary = await getAIContextSummary(
        targetRepo ? `Repository: ${targetRepo}` : 'Global Dashboard',
        jira || [],
        combinedGithub,
        slack || [],
        targetRepo || 'All Repositories'
      );
    } catch {
      aiSummary = cachedData?.aiSummary || 'An unexpected error occurred while compiling pipeline insights.';
    }
  }

  const responseData = {
    project: targetRepo || 'All Workspaces',
    repo: targetRepo,
    github: combinedGithub,
    jira: jira || [],
    slack: slack || [],
    aiSummary,
    authStatus,
  };

  // Write the fresh result to cache (skip if AI was skipped — partial data)
  if (!skipAI) {
    await contextCache.setContext(cacheKey, responseData);
  }

  return responseData;
}