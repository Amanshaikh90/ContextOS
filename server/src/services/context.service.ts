// server/src/services/context.service.ts
import { RecordMetadata } from "@pinecone-database/pinecone";
import { embeddingService } from "./ai/embeddings.service.js";
import { pineconeService } from "./vector/pinecone.service.js";

export const contextService = {
    async indexGithubPR(prData: any, repoName: string,userId:string) {
        try {
            // Clean out line breaks and prepare text for vector matching
            const content = `PR Title: ${prData.title || ''}. Description: ${prData.body || 'No description'}`;

            // Convert to mathematical coordinates 
            const vector = await embeddingService.generateEmbedding(content);

            // Structure meta blocks for fast filtering later on
            const metadata: RecordMetadata = {
                id: (prData.id || prData.number || Math.random()).toString(),
                type: 'pull_request',
                title: prData.title || "Untitled Pull Request",
                url: prData.html_url || "#",
                repository: repoName.trim().toLowerCase(), // "amanshalkh90/chatifyapp"
                short_repo: repoName.includes('/') ? repoName.split('/').pop()!.trim().toLowerCase() : repoName.trim().toLowerCase(),
                ownerId: userId.toString()
            };

            // Upsert safely with a predictable ID format
            const uniqueId = `pr-${prData.id || prData.number || Date.now()}`;
            await pineconeService.upsertContext(uniqueId, vector, metadata);
            
            console.log(`[Context Service] Successfully indexed PR: ${prData.title}`);
        } catch (error) {
            // Log the error but do not re-throw it to prevent crashing the webhook response pool
            console.error("[Context Service] Indexing Bypassed:", error);
        }
    }
};