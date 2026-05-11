import { RecordMetadata } from "@pinecone-database/pinecone";
import { embeddingService } from "./ai/embeddings.service.js";
import { title } from "node:process";
import { pineconeService } from "./vector/pinecone.service.js";



export const contextService = {
    async indexGithubPR(prData:any,repoName:string){
        try{

            // preparing text for ai
            const content = `PR Title: ${prData.title}. Description:${prData.body || 'No description'}`;

            // convert to vector
            const vector = await embeddingService.generateEmbedding(content);

            // Define metadata // doubt why we are doing this
            // got it , we are doing this for using the data for later 
            const metadata: RecordMetadata = {
                id:prData.id.toString(),
                type:'pull_request',
                title:prData.title,
                url:prData.html_url,
                repository:repoName,

            };

            // saving to pinecone

            await pineconeService.upsertContext(`pr-${prData.id}`,vector,metadata);
            console.log(`[Context Service] Successfully indexed PR:${prData.title}`);

        }catch(error){
            console.error("[Context Service] Indexing Error:",error);
            throw error;
        }
    }
}