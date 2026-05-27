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
    return iv.toString('hex') + '---' + encrypted.toString('hex');
};

export const decrypt = (text: string) => {
    if (!text.includes('---')) {
        // Fallback trace safety check for old legacy database strings split by colons
        const textParts = text.split(':');
        const ivPart = textParts.shift();
        
        if (!ivPart) {
            throw new Error("[Crypto] Decryption failed: Malformed legacy token layout.");
        }
        
        const iv = Buffer.from(ivPart, 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        return Buffer.concat([decrypted, decipher.final()]).toString();
    }

    // 💡 Fix: Destructure with explicit fallback defaults to guarantee string type
    const [ivHex, encryptedHex] = text.split('---');

    if (!ivHex || !encryptedHex) {
        throw new Error("[Crypto] Decryption failed: Malformed token layout missing signature bounds.");
    }

    const iv = Buffer.from(ivHex, 'hex');
    const encryptedText = Buffer.from(encryptedHex, 'hex');
    
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

// ✨ Self-Healing helper: Safely drops invalid/revoked integration rows 
export const deleteToken = async (userId: string, provider: string) => {
    try {
        return await prisma.oAuthToken.delete({
            where: { userId_provider: { userId, provider } }
        });
    } catch (err) {
        // Suppress errors if the record was already deleted or doesn't exist
        console.warn(`[dbHelper] Record cleanup bypass or already missing:`, err);
        return null;
    }
};