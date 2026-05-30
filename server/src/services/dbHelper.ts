import prisma from '../db.js';
import crypto from 'crypto';


const ENCRYPTION_KEY_RAW = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY_RAW || ENCRYPTION_KEY_RAW.length < 64) {
  throw new Error(
    '[FATAL] ENCRYPTION_KEY env var is missing or not a 64-char hex string. ' +
    "Generate: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
  );
}
const ENCRYPTION_KEY = Buffer.from(ENCRYPTION_KEY_RAW, 'hex'); 


const LEGACY_ENCRYPTION_KEY_RAW =
  process.env.LEGACY_ENCRYPTION_KEY || 'your-secret-32-char-long-key-!!';


export const encrypt = (text: string): string => {
  const iv = crypto.randomBytes(12); 
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
};


export const decrypt = (text: string): string => {
  
  if (text.includes('---')) {
    console.warn('[dbHelper] Decrypting a legacy AES-CBC token. User should re-authenticate to upgrade to GCM.');
    const parts = text.split('---');
    const ivHex = parts[0];
    const encryptedHex = parts[1];
    if (!ivHex || !encryptedHex) {throw new Error('[Crypto] Malformed legacy token: missing iv or ciphertext.');}

    
    const legacyKey = Buffer.from(LEGACY_ENCRYPTION_KEY_RAW);
    if (legacyKey.length !== 32) {
      throw new Error(
        `[Crypto] LEGACY_ENCRYPTION_KEY must be exactly 32 bytes. ` +
        `Got ${legacyKey.length} bytes. ` +
        `Check the value in your Railway env vars.`
      );
    }

    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', legacyKey, iv);
    const decrypted = decipher.update(Buffer.from(encryptedHex, 'hex'));
    return Buffer.concat([decrypted, decipher.final()]).toString();
  }

  
  const parts = text.split(':');
  if (parts.length < 3) {
    throw new Error('[Crypto] Malformed token — expected iv:authTag:ciphertext or iv---ciphertext.');
  }

  const ivHex = parts[0];
  const authTagHex = parts[1];
  const encrypted = parts.slice(2).join(':'); 

  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error('[Crypto] Malformed token — expected iv:authTag:ciphertext or iv---ciphertext.');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8'); 
  return decrypted;
};

export const createUser = async (email: string) => {
  return await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email },
  });
};


export const saveToken = async (
  userId: string,
  provider: string,
  accessToken: string,
  refreshToken?: string
) => {
  if (!/^[a-zA-Z0-9_\-]+$/.test(userId)) {
    throw new Error(`[dbHelper] Invalid userId format: "${userId}"`);
  }

  return await prisma.oAuthToken.upsert({
    where: { userId_provider: { userId, provider } },
    update: {
      accessToken: encrypt(accessToken),
      refreshToken: refreshToken ? encrypt(refreshToken) : undefined,
    },
    create: {
      provider,
      accessToken: encrypt(accessToken),
      refreshToken: refreshToken ? encrypt(refreshToken) : undefined,
      user: {
        connectOrCreate: {
          where: { id: userId },
          create: { id: userId },
        },
      },
    },
  });
};


export const getTokenByUserId = async (userId: string, provider: string) => {
  const record = await prisma.oAuthToken.findUnique({
    where: { userId_provider: { userId, provider } },
  });

  if (!record) {return null;}

  return {
    ...record,
    accessToken: decrypt(record.accessToken),
    refreshToken: record.refreshToken ? decrypt(record.refreshToken) : null,
  };
};


export const deleteToken = async (userId: string, provider: string) => {
  try {
    return await prisma.oAuthToken.delete({
      where: { userId_provider: { userId, provider } },
    });
  } catch {
    console.warn(`[dbHelper] Token already absent: userId=${userId}, provider=${provider}`);
    return null;
  }
};
