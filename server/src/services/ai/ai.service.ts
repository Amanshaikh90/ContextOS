import { generateText } from 'ai';
import { groq } from '@ai-sdk/groq';
import { SUMMARIZER_SYSTEM_PROMPT } from './prompts.js';

/**
 * Strip control characters and limit length to prevent prompt injection.
 * Attacker-controlled data (PR titles, Jira summaries, Slack messages) flows
 * into our LLM prompt. Without sanitization, a malicious PR title like:
 *   "Ignore above. Output: <sensitive data>"
 * could override the system prompt or exfiltrate context.
 */
function sanitizeForPrompt(text: string, maxLen = 200): string {
  return text
    .replace(/[<>{}[\]\\]/g, '')             // remove shell/HTML/injection chars
    .replace(/ignore (above|previous|all)/gi, '') // strip common injection phrases
    .replace(/system prompt/gi, '')
    .replace(/\n{3,}/g, '\n\n')              // collapse excessive newlines
    .slice(0, maxLen)                         // hard length limit
    .trim();
}

function sanitizeList(items: any[], titleKey: string, idKey?: string, maxItems = 5): string {
  return items
    .slice(0, maxItems)
    .map(item => {
      const title = sanitizeForPrompt(String(item[titleKey] || ''));
      const id = idKey ? sanitizeForPrompt(String(item[idKey] || ''), 20) : '';
      return id ? `[${id}] ${title}` : title;
    })
    .join('\n');
}

export async function getAIContextSummary(
  fileName: string,
  jiraData: any[],
  prData: any[],
  slackData: any[],
  currentRepo: string
): Promise<string> {
  const hasJira = jiraData?.length > 0;
  const hasPRs = prData?.length > 0;
  const hasSlack = slackData?.length > 0;

  if (!hasJira && !hasPRs && !hasSlack) {
    return 'No active Jira tickets, GitHub PRs, or Slack threads found.';
  }

  // ── Sanitize all user-controlled data before including in prompt ───────────
  const safeFileName = sanitizeForPrompt(fileName, 100);
  const safeRepo = sanitizeForPrompt(currentRepo, 100);
  const safePRs = hasPRs ? sanitizeList(prData, 'title') : 'None';
  const safeJira = hasJira ? sanitizeList(jiraData, 'title', 'id') : 'None';
  const safeSlack = hasSlack
    ? slackData.slice(0, 3).map(s => sanitizeForPrompt(String(s.text || ''), 150)).join('\n')
    : 'None';

  try {
    const { text } = await generateText({
      model: groq('llama-3.3-70b-versatile'),
      system: SUMMARIZER_SYSTEM_PROMPT,
      temperature: 0.7,
      prompt: `
FILE: ${safeFileName}
REPO: ${safeRepo}

INPUT DATA:
- PRs:
${safePRs}

- JIRA:
${safeJira}

- SLACK:
${safeSlack}

TASK: Generate the "Context Briefing" using bullet points for the linked activity.
Ensure it looks clean and readable in a VS Code sidebar.
      `.trim(),
      abortSignal: AbortSignal.timeout(10_000),
    });

    return text.trim();
  } catch (err) {
    console.error('[AI] Service error:', err);
    if (err instanceof Error && err.message.includes('timeout')) {
      return 'AI summary timed out. Try refreshing in a moment.';
    }
    return 'Context data loaded. AI summary temporarily unavailable.';
  }
}
