import crypto from 'crypto';
import { config } from '../config/config';

/**
 * Fernet Decryption for Node.js
 * 
 * Matches the Python Kinship Agent encryption logic:
 * 1. Key derivation: PBKDF2HMAC(SHA256, salt='kinship_tool_credentials', iterations=100000)
 * 2. Encryption: Fernet (version + timestamp + IV + AES-128-CBC ciphertext + HMAC)
 */

const FERNET_VERSION = 0x80;
const TIMESTAMP_SIZE = 8;
const IV_SIZE = 16;
const HMAC_SIZE = 32;

// Must match Python: salt = b'kinship_tool_credentials'
const PBKDF2_SALT = Buffer.from('kinship_tool_credentials', 'utf8');
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEY_LENGTH = 32;

/**
 * Convert base64url to standard base64
 */
function base64urlToBase64(base64url: string): string {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }
  return base64;
}

/**
 * Derive Fernet key using PBKDF2 (matches Python Kinship Agent)
 * 
 * Python code:
 *   kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100000)
 *   return base64.urlsafe_b64encode(kdf.derive(secret.encode()))
 */
function deriveFernetKey(secretKey: string): Buffer {
  console.log('[FERNET] Deriving key using PBKDF2...');
  console.log('[FERNET] Secret key:', secretKey.substring(0, 20) + '...');
  console.log('[FERNET] Salt:', PBKDF2_SALT.toString('utf8'));
  console.log('[FERNET] Iterations:', PBKDF2_ITERATIONS);

  // Derive 32 bytes using PBKDF2
  const derivedKey = crypto.pbkdf2Sync(
    secretKey,
    PBKDF2_SALT,
    PBKDF2_ITERATIONS,
    PBKDF2_KEY_LENGTH,
    'sha256'
  );

  console.log('[FERNET] Derived key (hex):', derivedKey.toString('hex').substring(0, 32) + '...');

  // In Python, the derived key is base64url encoded to create the Fernet key
  // But for decryption, we use the raw 32 bytes directly
  // First 16 bytes: HMAC signing key
  // Last 16 bytes: AES-128 encryption key

  return derivedKey;
}

/**
 * Get Fernet key components
 */
function getFernetKeyComponents(): { signingKey: Buffer; encryptionKey: Buffer } {
  const secretKey = config.encryptionSecretKey;

  let keyBuffer: Buffer;

  // Check if it's already a valid 44-char Fernet key (base64url encoded 32 bytes)
  if (secretKey.length === 44 || secretKey.length === 43) {
    console.log('[FERNET] Using provided Fernet key directly');
    const base64Key = base64urlToBase64(secretKey);
    keyBuffer = Buffer.from(base64Key, 'base64');

    if (keyBuffer.length !== 32) {
      console.log('[FERNET] Invalid key length, falling back to PBKDF2 derivation');
      keyBuffer = deriveFernetKey(secretKey);
    }
  } else {
    // Derive key from secret using PBKDF2 (matches Python Kinship Agent)
    keyBuffer = deriveFernetKey(secretKey);
  }

  // First 16 bytes: signing key (HMAC-SHA256)
  // Last 16 bytes: encryption key (AES-128-CBC)
  return {
    signingKey: keyBuffer.subarray(0, 16),
    encryptionKey: keyBuffer.subarray(16, 32),
  };
}

/**
 * Decrypt a Fernet token
 */
export function decryptFernet(token: string): string {
  try {
    console.log('[FERNET] Input token length:', token.length);
    console.log('[FERNET] Token prefix:', token.substring(0, 20));

    // Convert base64url to standard base64 and decode
    const base64Token = base64urlToBase64(token);
    const data = Buffer.from(base64Token, 'base64');

    console.log('[FERNET] Decoded data length:', data.length);

    // Minimum size: version(1) + timestamp(8) + iv(16) + ciphertext(16 min) + hmac(32) = 73
    if (data.length < 73) {
      throw new Error(`Token too short: ${data.length} bytes`);
    }

    // Extract components
    const version = data[0];
    const timestamp = data.subarray(1, 1 + TIMESTAMP_SIZE);
    const iv = data.subarray(1 + TIMESTAMP_SIZE, 1 + TIMESTAMP_SIZE + IV_SIZE);
    const ciphertextAndHmac = data.subarray(1 + TIMESTAMP_SIZE + IV_SIZE);
    const ciphertext = ciphertextAndHmac.subarray(0, ciphertextAndHmac.length - HMAC_SIZE);
    const hmac = ciphertextAndHmac.subarray(ciphertextAndHmac.length - HMAC_SIZE);

    console.log('[FERNET] Version:', version, '(expected:', FERNET_VERSION, ')');
    console.log('[FERNET] IV length:', iv.length);
    console.log('[FERNET] Ciphertext length:', ciphertext.length);
    console.log('[FERNET] HMAC length:', hmac.length);

    // Verify version
    if (version !== FERNET_VERSION) {
      throw new Error(`Invalid Fernet version: ${version}, expected ${FERNET_VERSION}`);
    }

    // Get key components (derived via PBKDF2)
    const { signingKey, encryptionKey } = getFernetKeyComponents();

    console.log('[FERNET] Signing key (hex):', signingKey.toString('hex'));
    console.log('[FERNET] Encryption key (hex):', encryptionKey.toString('hex'));

    // Verify HMAC (over version + timestamp + iv + ciphertext)
    const signedData = data.subarray(0, data.length - HMAC_SIZE);
    const expectedHmac = crypto.createHmac('sha256', signingKey).update(signedData).digest();

    console.log('[FERNET] Expected HMAC:', expectedHmac.toString('hex').substring(0, 32) + '...');
    console.log('[FERNET] Actual HMAC:  ', hmac.toString('hex').substring(0, 32) + '...');

    if (!crypto.timingSafeEqual(hmac, expectedHmac)) {
      console.error('[FERNET] HMAC verification failed!');
      console.error('[FERNET] This usually means the ENCRYPTION_SECRET_KEY does not match');
      throw new Error('Invalid HMAC - token may be corrupted or wrong key');
    }

    console.log('[FERNET] ✅ HMAC verified successfully');

    // Decrypt with AES-128-CBC
    const decipher = crypto.createDecipheriv('aes-128-cbc', encryptionKey, iv);
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    const result = decrypted.toString('utf8');
    console.log('[FERNET] ✅ Decryption successful, result length:', result.length);

    return result;
  } catch (error) {
    console.error('[FERNET] Decryption error:', error);
    throw error;
  }
}

/**
 * Decrypt an encrypted string (auto-detect format)
 */
export function decrypt(encryptedText: string): string {
  try {
    console.log('[CRYPTO] Attempting to decrypt, input length:', encryptedText.length);
    console.log('[CRYPTO] Input preview:', encryptedText.substring(0, 30) + '...');

    // Check if it's Fernet format (starts with gAAAAAB when base64 decoded = 0x80 version byte)
    if (encryptedText.startsWith('gAAAAAB')) {
      console.log('[CRYPTO] Detected Fernet format');
      return decryptFernet(encryptedText);
    }

    // Check for iv:data format (legacy AES-256-CBC)
    const parts = encryptedText.split(':');
    if (parts.length === 2) {
      console.log('[CRYPTO] Detected iv:data format');
      return decryptAesCbc(parts[0], parts[1]);
    }

    // Try Fernet anyway
    console.log('[CRYPTO] Trying Fernet format as fallback');
    return decryptFernet(encryptedText);
  } catch (error) {
    console.error('[CRYPTO] Decryption error:', error);
    throw new Error('Failed to decrypt credentials');
  }
}

/**
 * Decrypt AES-256-CBC with separate IV and data (both base64)
 */
function decryptAesCbc(ivBase64: string, dataBase64: string): string {
  const iv = Buffer.from(ivBase64, 'base64');
  const encryptedData = Buffer.from(dataBase64, 'base64');

  const key = crypto.createHash('sha256').update(config.encryptionSecretKey).digest();

  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedData);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
}

/**
 * Decrypt and parse credentials JSON
 */
export function decryptCredentials<T = any>(encryptedCredentials: string): T {
  const decrypted = decrypt(encryptedCredentials);
  console.log('[CRYPTO] Decrypted content preview:', decrypted.substring(0, 100) + '...');
  return JSON.parse(decrypted);
}
