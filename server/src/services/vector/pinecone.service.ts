import { Pinecone, RecordMetadata } from '@pinecone-database/pinecone';

const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

const indexName = process.env.PINECONE_INDEX_NAME!;
const index = pc.index<RecordMetadata>(indexName);

export const pineconeService = {
  async upsertContext(id: string, vector: number[], metadata: RecordMetadata) {
    try {
      await index.upsert({
        records: [{
          id,
          values: vector,
          metadata
        }]
      });
    } catch (error) {
      console.error("[Pinecone Service] Upsert Error:", error);
    }
  },

  async queryContext(vector: number[], topK: number = 5, repoName?: string) {
    try {
      // Create the query object
      const queryOptions: any = {
        vector: vector,
        topK: topK,
        includeMetadata: true,
      };

      // Add filter if repoName exists
      if (repoName && repoName !== "Unknown Project") {
        queryOptions.filter = {
          repository: { "$eq": repoName } 
        };
      } else {
        return [];
      }

      const results = await index.query(queryOptions);
      return results.matches;
    } catch (error) {
      console.error("[Pinecone Service] Query Error:", error);
      return [];
    }
  }
};