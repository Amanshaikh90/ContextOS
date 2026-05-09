import { WebClient } from '@slack/web-api';

export const fetchSlackThreads = async (file: string, token: string) => {
    const slack = new WebClient(token);

    try {
        const query = file ? `to:me ${file}` : "to:me";

        const result = await slack.search.messages({
            query: query,
            count: 5,
            sort: 'timestamp'
        });

        const matches = (result.messages?.matches as any[]) || [];

        return matches.map((msg: any) => ({
            id: msg.ts,
            channel: msg.channel?.name || "private",
            text: msg.text,
            url: msg.permalink
        }));
    } catch (error) {
        console.error("Slack Fetch Error:", error);
        return []; 
    }
};