import { Pinecone } from '@pinecone-database/pinecone';

const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

export const embeddingService = {
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      // 1. Clean the text
      const cleanText: string = text.replace(/\n/g, ' ');

      // 2. Generate the embedding
      const embeddings:any = await pc.inference.embed({
        model: 'llama-text-embed-v2',
        inputs: [cleanText],
        parameters: { 
          inputType: 'passage', 
          truncate: 'END' 
        }
      });

      // 3. Extract and return the values (OUTSIDE the object literal above)
      if (!embeddings.data || embeddings.data.length === 0) {
        throw new Error("Pinecone inference returned no data.");
      }

      const vector = embeddings.data[0].values;

      // Check if values is possibly undefined (another safety layer)
      if (!vector) {
        throw new Error("Embedding values are missing in the response.");
      }

      return Array.from(vector as number[]);

    } catch (error) {
      console.error("[Embedding Service] Error:", error);
      throw new Error("Failed to generate free vector embedding.");
    }
  }
};