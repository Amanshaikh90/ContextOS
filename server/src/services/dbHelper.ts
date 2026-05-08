import { access } from 'node:fs';
import prisma from '../db.js';




// CreateUser: Ensure a user exits in our DB

export const createUser = async (email:string)=>{
    return await prisma.user.upsert({
        where:{email},
        update:{}, //if they exists , do nothing
        create:{email},
    });
};



// saveToken: Stores OAuth keys for GitHub/Slack/Jira


export const saveToken = async (
  userId: string, 
  provider: string, 
  accessToken: string, 
  refreshToken?: string
) => {
  return await prisma.oAuthToken.upsert({
    where: {
      userId_provider: { userId, provider }
    },
    update: { accessToken, refreshToken },
    create: { userId, provider, accessToken, refreshToken }
  });
};



// getTokenByUserId: Retrieves the key when needed


export const getTokenByUserId = async (userId:string,provider:string) => {
    return await prisma.oAuthToken.findUnique({
        where:{
            userId_provider:{userId,provider}
        }
    });
};