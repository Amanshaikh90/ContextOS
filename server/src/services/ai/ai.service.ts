import {generateText} from 'ai';
import {anthropic} from '@ai-sdk/anthropic';
import {google} from '@ai-sdk/google';
import { SUMMARIZER_SYSTEM_PROMPT } from './prompts.js';
import { groq } from '@ai-sdk/groq';




export async function getAIContextSummary(fileName: string, jiraData: any[], prData: any[], slackData: any[]) {
    // Check if TOTAL context is zero
    const hasJira = jiraData && jiraData.length > 0;
    const hasPRs = prData && prData.length > 0;
    const hasSlack = slackData && slackData.length > 0;

    if (!hasJira && !hasPRs && !hasSlack) {
        return "No active Jira tickets, GitHub PRs, or Slack threads found for this file.";
    }

    try {
        const { text } = await generateText({
            model: groq('llama-3.3-70b-versatile'),
            system: SUMMARIZER_SYSTEM_PROMPT,
            prompt: `
                Current File: ${fileName}
                ${hasJira ? `Related Jira: ${JSON.stringify(jiraData.map(j => ({ id: j.id, title: j.title })))}` : ''}
                ${hasPRs ? `Related PRs: ${JSON.stringify(prData.map(p => ({ title: p.title })))}` : ''}
                ${hasSlack ? `Related Slack: ${JSON.stringify(slackData.map(s => ({ text: s.text })))}` : ''}
            `,
            abortSignal: AbortSignal.timeout(5000),
        });
        return text.trim();
    } catch (error) {
        console.error("[AI] Service Error:", error);
        return "Context is available below, but the AI summary couldn't be generated.";
    }
}