// server/src/services/vector/pinecone.service.ts
import { Pinecone, RecordMetadata } from '@pinecone-database/pinecone';

const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY || 'mock-key-for-safety',
});

const indexName = process.env.PINECONE_INDEX_NAME || '';

export const pineconeService = {
  async upsertContext(id: string, vector: number[], metadata: RecordMetadata) {
    if (!indexName) {
      console.warn("⚠️ PINECONE_INDEX_NAME is missing. Skipping vector persistence.");
      return;
    }
    try {
      const index = pc.index<RecordMetadata>(indexName);
      await index.upsert({
        records: [{ id, values: vector, metadata }]
      });
    } catch (error) {
      console.error("[Pinecone Service] Upsert Error:", error);
    }
  },

  async queryContext(vector: number[], topK: number = 5, repoName?: string,userId?:string) {
    // Escape cleanly if something goes wrong with the index configurations
    if (!vector || vector.length === 0 || !indexName) {
      return [];
    }

    try {
      const index = pc.index<RecordMetadata>(indexName);
      const queryOptions: any = {
        vector: vector,
        topK: topK,
        includeMetadata: true,
      };

      // Smart filter: only restrict query matches if a valid repo is specified
      if (repoName && repoName.trim() !== "" && repoName !== "Unknown Project" && userId) {
        const cleanRepo = repoName.trim().toLowerCase();
        
        queryOptions.filter = {
          "$and": [
            { ownerId: { "$eq": userId.toString() } },
            cleanRepo.includes('/')
              ? { repository: { "$eq": cleanRepo } }
              : { short_repo: { "$eq": cleanRepo } }
          ]
        };
      }

      const results = await index.query(queryOptions);
      return results.matches || [];
    } catch (error) {
      console.error("[Pinecone Service] Query Catch Recovered:", error);
      return []; // Always return an array to prevent 500 breaks downstream
    }
  }
};