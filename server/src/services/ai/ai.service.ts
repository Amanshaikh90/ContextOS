import {generateText} from 'ai';
import {anthropic} from '@ai-sdk/anthropic';
import {google} from '@ai-sdk/google';
import { SUMMARIZER_SYSTEM_PROMPT } from './prompts.js';
import { groq } from '@ai-sdk/groq';




export async function getAIContextSummary(fileName: string, jiraData: any[], prData: any[], slackData: any[],currentRepo: string) {
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
            temperature: 0.7, // Higher temperature prevents "same type of answer"
            prompt: `
                FILE: ${fileName}
                REPO: ${currentRepo}

                INPUT DATA:
                - PRs: ${hasPRs ? JSON.stringify(prData.map(p => p.title)) : 'None'}
                - JIRA: ${hasJira ? JSON.stringify(jiraData.map(j => ({ id: j.id, title: j.title }))) : 'None'}
                - SLACK: ${hasSlack ? JSON.stringify(slackData.map(s => s.text).slice(0, 3)) : 'None'}

                TASK: Generate the "Context Briefing" using bullet points for the linked activity. 
                Ensure it looks clean and readable in a VS Code sidebar.
        `,
            abortSignal: AbortSignal.timeout(10000),
        });
        return text.trim();
    } catch (error) {
    console.error("[AI] Service Error:", error);
    if (error instanceof Error && error.message.includes('timeout')) {
        return "AI Summary timed out. Try refreshing in a moment.";
    }
    return "Context data found below, but the AI summary is currently resting.";
}
}






   /*             === PROJECT CONTEXT ===
                REPOSIITORY: ${currentRepo}
                ACTIVE FILE: ${fileName}

                === DATA TO ANALYZE ===
                ${hasPRs ? `FOUND PRs for ${currentRepo}: ${JSON.stringify(prData.map(p => ({ title: p.title })))}` : `No PRs found for this repo.`}
                ${hasJira ? `FOUND JIRA for ${currentRepo}: ${JSON.stringify(jiraData.map(j => ({ id: j.id, title: j.title })))}` : ''}
                ${hasSlack ? `FOUND SLACK: ${JSON.stringify(slackData.map(s => ({ text: s.text })))}` : ''}

                === CRITICAL INSTRUCTIONS ===
                1. Focus ONLY on the repository: ${currentRepo}.
                2. If "FOUND PRs" is not empty, you MUST mention the PR titles in your summary.
                3. If no data is found for ${currentRepo}, explain that ${fileName} appears to be in a dormant state in this specific repository.
                4. NEVER mix context from other repositories.

                */