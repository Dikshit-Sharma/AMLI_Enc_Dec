/**
 * AES/GCM/NoPadding implementation using Web Crypto API.
 */

const GCM_ALGO = 'AES-GCM';
const CBC_ALGO = 'AES-CBC';
const GCM_IV_LENGTH = 12;
const GCM_TAG_LENGTH = 128; // bits

/** Robust Base64 handles binary data without stack overflow or encoding issues */
function bytesToBase64(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(base64) {
  const binaryString = atob(base64.trim());
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/** Generate 128-bit AES key in Hex format (matches Java logic) */
export function generateAESKeyHex() {
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBase64(hex) {
  // User requested literal string encoding: btoa(hexString)
  return btoa(hex);
}

export function base64ToHex(base64) {
  // User requested literal string decoding: atob(base64)
  try {
    return atob(base64.trim());
  } catch (e) {
    return '';
  }
}

export async function encrypt(plainText, base64Key) {
  try {
    const keyData = base64ToBytes(base64Key);
    const cryptoKey = await window.crypto.subtle.importKey(
      'raw', keyData, { name: GCM_ALGO }, false, ['encrypt']
    );

    const iv = window.crypto.getRandomValues(new Uint8Array(GCM_IV_LENGTH));
    const encodedText = new TextEncoder().encode(plainText);

    const cipherBuffer = await window.crypto.subtle.encrypt(
      { name: GCM_ALGO, iv: iv, tagLength: GCM_TAG_LENGTH },
      cryptoKey,
      encodedText
    );

    const cipherArray = new Uint8Array(cipherBuffer);
    const result = new Uint8Array(iv.length + cipherArray.length);
    result.set(iv);
    result.set(cipherArray, iv.length);

    return bytesToBase64(result);
  } catch (error) {
    console.error('GCM Encryption error:', error);
    throw new Error('GCM Encryption failed: ' + error.message);
  }
}

export async function decrypt(base64CipherText, base64Key) {
  try {
    const keyData = base64ToBytes(base64Key);
    const cryptoKey = await window.crypto.subtle.importKey(
      'raw', keyData, { name: GCM_ALGO }, false, ['decrypt']
    );

    const data = base64ToBytes(base64CipherText);
    if (data.length < GCM_IV_LENGTH) throw new Error('Ciphertext too short');

    const iv = data.slice(0, GCM_IV_LENGTH);
    const cipherText = data.slice(GCM_IV_LENGTH);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: GCM_ALGO, iv: iv, tagLength: GCM_TAG_LENGTH },
      cryptoKey,
      cipherText
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (error) {
    console.error('GCM Decryption error:', error);
    throw new Error('GCM Decryption failed: ' + error.message);
  }
}

/**
 * Helper to derive 16-byte key from string (matches Java getKeyBytes)
 */
function getKeyBytes(key) {
  const keyBytes = new Uint8Array(16);
  const encoded = new TextEncoder().encode(key);
  keyBytes.set(encoded.slice(0, 16));
  return keyBytes;
}

/**
 * AES/CBC Encryption (Matches Java: Key used as IV)
 * Note: Web Crypto AES-CBC uses PKCS#7 padding by default,
 * which is identical to Java's PKCS#5Padding for AES.
 */
export async function encryptCBC(plainText, key) {
  try {
    const keyBytes = getKeyBytes(key);
    const cryptoKey = await window.crypto.subtle.importKey(
      'raw', keyBytes, { name: CBC_ALGO }, false, ['encrypt']
    );

    const encodedText = new TextEncoder().encode(plainText);

    // We pass a fresh copy of keyBytes as IV to ensure no mutation issues
    const iv = new Uint8Array(keyBytes);

    const cipherBuffer = await window.crypto.subtle.encrypt(
      { name: CBC_ALGO, iv: iv },
      cryptoKey,
      encodedText
    );

    return bytesToBase64(new Uint8Array(cipherBuffer));
  } catch (error) {
    console.error('CBC Encryption error:', error);
    throw new Error('CBC Encryption failed: ' + error.message);
  }
}

/**
 * AES/CBC Decryption (Matches Java: Key used as IV)
 */
export async function decryptCBC(base64CipherText, key) {
  try {
    const keyBytes = getKeyBytes(key);
    const cryptoKey = await window.crypto.subtle.importKey(
      'raw', keyBytes, { name: CBC_ALGO }, false, ['decrypt']
    );

    const data = base64ToBytes(base64CipherText);

    // AES block size is 16 bytes. Input must be a multiple.
    if (data.length === 0 || data.length % 16 !== 0) {
      throw new Error(`Invalid ciphertext length (${data.length}). CBC ciphertext must be a multiple of 16.`);
    }

    const iv = new Uint8Array(keyBytes);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: CBC_ALGO, iv: iv },
      cryptoKey,
      data
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (error) {
    console.error('CBC Decryption error:', error);
    if (error.name === 'OperationError' || error.name === 'DataError') {
      throw new Error('Decryption failed. Please ensure your key is correct and the text was encrypted using AES/CBC/PKCS5Padding.');
    }
    throw new Error('CBC Decryption failed: ' + error.message);
  }
}
