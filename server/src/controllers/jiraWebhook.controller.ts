import { Request, Response } from 'express';

export const handleJiraWebhook = async (req: Request, res: Response) => {
  try {
    const event = req.body;
    
    // 1. Log the incoming webhook event type
    console.log(`[Jira Webhook Received] Event: ${event.webhookEvent}`);

    // 2. Extract issue data from Jira's webhook payload
    const issue = event.issue;
    if (!issue) {
      return res.status(200).json({ message: "No issue data found in payload" });
    }

    const ticketId = issue.key; // e.g., "DTB-1"
    const title = issue.fields?.summary || "Untitled Task";
    const description = issue.fields?.description || "No description provided";
    const status = issue.fields?.status?.name || "To Do";
    const assignee = issue.fields?.assignee?.displayName || "Unassigned";
    const accountId = issue.fields?.assignee?.accountId || null; // Useful for mapping to your users

    console.log(`⚡ Live Syncing Ticket: [${ticketId}] - ${title} (Assigned to: ${assignee})`);

    // 3. TODO: Insert your existing DB/Pinecone caching logic here!
    // Example: 
    // const content = `Jira Ticket: ${ticketId}. Title: ${title}. Description: ${description}. Status: ${status}`;
    // const vector = await embeddingService.generateEmbedding(content);
    // await pineconeService.upsertContext(`jira-${ticketId}`, vector, metadata);

    // Always respond with a 200 immediately so Jira knows you received it safely
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error processing Jira webhook:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};