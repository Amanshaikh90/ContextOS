import { access } from 'node:fs';
import prisma from '../db.js';
import crypto from 'crypto';


const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-secret-32-char-long-key-!!'; // Must be 32 chars
const IV_LENGTH = 16; 

const encrypt = (text: string) => {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
};

const decrypt = (text: string) => {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
};

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
    update: { 
        accessToken: encrypt(accessToken), // Encrypted
        refreshToken: refreshToken ? encrypt(refreshToken) : undefined
        
    },
    // NECESSARY CHANGE: Use connectOrCreate to satisfy the Foreign Key constraint
    create: { 
      provider, 
      accessToken: encrypt(accessToken), 
      refreshToken: refreshToken ? encrypt(refreshToken) : undefined,
      user: {
        connectOrCreate: {
          where: { id: userId },
          create: { id: userId }
        }
      }
    }
  });
};



// getTokenByUserId: Retrieves the key when needed


export const getTokenByUserId = async (userId: string, provider: string) => {
    const record = await prisma.oAuthToken.findUnique({
        where: { userId_provider: { userId, provider } }
    });

    if (record) {
        return {
            ...record,
            accessToken: decrypt(record.accessToken),
            refreshToken: record.refreshToken ? decrypt(record.refreshToken) : null
        };
    }
    return null;
};