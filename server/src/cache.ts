import {redis} from './index.js';

export const contextCache = {
    setContext: async (key:string,data:any)=>{
        if (redis.status !== 'ready') {
            console.log('⚠️ Redis not ready, skipping cache set');
            return;
        }
        try{
            const stringData=JSON.stringify(data);

            await redis.set(key,stringData,'EX',60);
            console.log(`Context cached for key :${key } (Expires in 60s)`);
        }catch(error){
            console.log('Redis Set Error:', error);
        }
    },

    getContext:async(key:string)=>{
        if (redis.status !== 'ready') {
            return null;
        }
        try{
            const data=await redis.get(key);
            return data ? JSON.parse(data):null;

        }catch(error){
            console.error('Redis Get Error:', error);
            return null;
        }
    }
};