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
  } catch {
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

/* ─── AES/RSA Hybrid Encryption ─────────────────────────────────────── */

const RSA_OAEP = 'RSA-OAEP';
const RSASSA_PKCS1 = 'RSASSA-PKCS1-v1_5';
const RSA_SEPARATOR = ':';

/**
 * Strip PEM headers/footers and return raw Base64 content.
 * Accepts both PEM-formatted and raw Base64 strings.
 */
function stripPEM(pem) {
  return pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s+/g, '')
    .trim();
}

/* ─── X.509 certificate → SPKI extraction (for Java KeyPairGeneratorUtil keys) ─
 * Java generates the public key as a self-signed X.509 certificate (via
 * BouncyCastle X509v3CertificateBuilder). WebCrypto importKey('spki', …)
 * expects raw SubjectPublicKeyInfo, not a full certificate. These helpers
 * parse the DER-encoded certificate and extract the SPKI bytes so both
 * formats work transparently.
 */

function derLengthInfo(bytes, pos) {
  const first = bytes[pos];
  if ((first & 0x80) === 0) return { length: first, lenBytes: 1 };
  const numBytes = first & 0x7f;
  if (numBytes === 0 || numBytes > 4) throw new Error('Invalid DER length');
  let length = 0;
  for (let i = 0; i < numBytes; i++) length = (length << 8) | bytes[pos + 1 + i];
  return { length, lenBytes: 1 + numBytes };
}

function parseTLV(bytes, offset) {
  const tag = bytes[offset];
  const { length, lenBytes } = derLengthInfo(bytes, offset + 1);
  const headerLen = 1 + lenBytes;
  const valueOffset = offset + headerLen;
  const nextOffset = valueOffset + length;
  if (nextOffset > bytes.length) throw new Error('DER TLV overflows buffer');
  return { tag, length, headerLen, valueOffset, nextOffset, offset };
}

/**
 * If `bytes` is a DER-encoded X.509 certificate, extract the
 * SubjectPublicKeyInfo (SPKI) bytes. Otherwise return null (caller
 * should treat input as raw SPKI).
 */
function tryExtractSPKI(bytes) {
  try {
    if (bytes.length < 100 || bytes[0] !== 0x30) return null;
    const outer = parseTLV(bytes, 0);
    if (outer.tag !== 0x30) return null;
    // Outer SEQUENCE should contain exactly 3 elements: TBSCertificate,
    // signatureAlgorithm, signatureValue. A raw SPKI is a single SEQUENCE
    // with 2 elements (algorithm + bit string) — much smaller and not 3.
    // Use this to distinguish.
    // Peek first child of outer
    const tbs = parseTLV(bytes, outer.valueOffset);
    if (tbs.tag !== 0x30) return null;
    // TBSCertificate is large (contains version, serial, issuer, validity,
    // subject, SPKI, extensions). SPKI-algorithm SEQUENCE is small (~20 bytes).
    // If tbs.length < 100 it is not a TBSCertificate.
    if (tbs.length < 100) return null;
    // Ensure outer has 3 top-level children (TBSCert + sigAlg + sigValue)
    let count = 0;
    let cur = outer.valueOffset;
    while (cur < outer.nextOffset) {
      const el = parseTLV(bytes, cur);
      count++;
      cur = el.nextOffset;
      if (count > 3) break;
    }
    if (count !== 3) return null;

    // Parse TBSCertificate children to locate SPKI
    const tbsElements = [];
    cur = tbs.valueOffset;
    while (cur < tbs.nextOffset) {
      const el = parseTLV(bytes, cur);
      tbsElements.push(el);
      cur = el.nextOffset;
    }
    if (tbsElements.length < 6) return null;
    // [0] may be [0] EXPLICIT Version (tag 0xA0). Shift index accordingly.
    const spkiIndex = tbsElements[0].tag === 0xa0 ? 6 : 5;
    if (spkiIndex >= tbsElements.length) return null;
    const spkiEl = tbsElements[spkiIndex];
    if (spkiEl.tag !== 0x30) return null;
    // Return a copy of the SPKI TLV (tag+length+value)
    return bytes.slice(spkiEl.offset, spkiEl.nextOffset);
  } catch {
    return null;
  }
}

function toArrayBuffer(u8) {
  // Sliced views share the underlying ArrayBuffer with a non-zero byteOffset;
  // WebCrypto requires the exact bytes, so copy if needed.
  if (u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength) return u8.buffer;
  const copy = new Uint8Array(u8.byteLength);
  copy.set(u8);
  return copy.buffer;
}

/**
 * Import an RSA private key (PKCS#8 format) from Base64 or PEM.
 * Used for: RSA-OAEP decryption of the AES key header.
 *
 * NOTE: Java's "RSA/ECB/OAEPPADDING" defaults to OAEP with SHA-1 +
 * MGF1-SHA1, so we match that for interoperability with the server-side
 * EncryptionUtil/DecryptionUtil in docs/.
 */
async function importRSAPrivateKey(keyStr) {
  const raw = base64ToBytes(stripPEM(keyStr));
  return window.crypto.subtle.importKey(
    'pkcs8', raw.buffer, { name: RSA_OAEP, hash: 'SHA-1' }, false, ['decrypt']
  );
}

/**
 * Import an RSA private key for signing (RSASSA-PKCS1-v1_5).
 */
async function importRSASigningKey(keyStr) {
  const raw = base64ToBytes(stripPEM(keyStr));
  return window.crypto.subtle.importKey(
    'pkcs8', raw.buffer, { name: RSASSA_PKCS1, hash: 'SHA-256' }, false, ['sign']
  );
}

/**
 * Import an RSA public key from Base64 or PEM for encryption (RSA-OAEP).
 * Accepts an SPKI-encoded (SubjectPublicKeyInfo) public key OR a Base64
 * X.509 certificate (as generated by Java KeyPairGeneratorUtil/BouncyCastle).
 * OAEP uses SHA-1 + MGF1-SHA1 to match Java's "RSA/ECB/OAEPPADDING" default.
 */
async function importRSAPublicKey(keyStr) {
  let raw = base64ToBytes(stripPEM(keyStr));
  // If the DER data looks like an X.509 certificate, extract the SPKI
  const spki = tryExtractSPKI(raw);
  const spkiBuffer = spki ? toArrayBuffer(spki) : raw.buffer;
  return window.crypto.subtle.importKey(
    'spki', spkiBuffer, { name: RSA_OAEP, hash: 'SHA-1' }, false, ['encrypt']
  );
}

/**
 * Import an RSA public key for signature verification (RSASSA-PKCS1-v1_5,
 * SHA-256 to match Java's "SHA256withRSA"). Handles both raw SPKI and
 * X.509 certificate formats.
 */
async function importRSAVerifyKey(keyStr) {
  let raw = base64ToBytes(stripPEM(keyStr));
  const spki = tryExtractSPKI(raw);
  const spkiBuffer = spki ? toArrayBuffer(spki) : raw.buffer;
  return window.crypto.subtle.importKey(
    'spki', spkiBuffer, { name: RSASSA_PKCS1, hash: 'SHA-256' }, false, ['verify']
  );
}

/**
 * Generate a random 32-char hex string (matches Java UUID-based dynamic key).
 */
function generateDynamicAESKey() {
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a random RSA key pair and return the raw Base64 encodings:
 *  - privateKey: PKCS#8 encoded (matches Java DecryptionUtil.getPrivateKey)
 *  - publicKey:  SPKI encoded
 *
 * The pair can be used for AES/RSA hybrid mode where the private key signs +
 * unwraps and the public key verifies + wraps.
 *
 * @param {number} modulusLength - RSA key size in bits (default 2048)
 * @returns {Promise<{privateKey: string, publicKey: string}>}
 */
export async function generateRSAKeyPair(modulusLength = 2048) {
  try {
    // Generate an RSA-OAEP key pair; export supports both OAEP and
    // RSASSA-PKCS1-v1_5 usage because we export the raw PKCS#8 / SPKI and
    // re-import per operation inside encryptRSA/decryptRSA.
    const keyPair = await window.crypto.subtle.generateKey(
      { name: RSA_OAEP, modulusLength, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-1' },
      true, // extractable so we can export
      ['encrypt', 'decrypt']
    );

    const privBuffer = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
    const pubBuffer = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);

    return {
      privateKey: bytesToBase64(new Uint8Array(privBuffer)),
      publicKey: bytesToBase64(new Uint8Array(pubBuffer)),
    };
  } catch (error) {
    console.error('RSA key pair generation error:', error);
    throw new Error('RSA key pair generation failed: ' + error.message);
  }
}

/**
 * AES/GCM + RSA hybrid encryption (matches Java EncryptionUtil).
 *
 * Flow:
 * 1. Generate random dynamic AES key (32-char hex)
 * 2. Derive IV from first 16 bytes of the AES key
 * 3. AES/GCM encrypt the plaintext (128-bit auth tag)
 * 4. Sign the Base64 ciphertext with RSA (SHA256withRSA)
 * 5. RSA-OAEP encrypt the AES key with the public key
 * 6. Output: Base64( rsaEncryptedKey : base64Ciphertext : base64Signature )
 *
 * @param {string} plainText - The plaintext to encrypt
 * @param {string} privateKeyBase64 - RSA private key (PKCS#8 Base64) for signing
 * @param {string} publicKeyBase64 - RSA public key (SPKI Base64 or X.509 cert) for key wrapping
 * @returns {string} Base64-encoded envelope containing all three parts
 */
export async function encryptRSA(plainText, privateKeyBase64, publicKeyBase64) {
  try {
    // 1. Generate dynamic AES key (UUID-like 32-char hex)
    const dynamicKey = generateDynamicAESKey();
    const aesKeyBytes = new TextEncoder().encode(dynamicKey);

    // 2. Derive IV from first 16 bytes of AES key
    const iv = aesKeyBytes.slice(0, 16);

    // 3. AES/GCM encrypt the plaintext
    const cryptoKey = await window.crypto.subtle.importKey(
      'raw', aesKeyBytes, { name: GCM_ALGO }, false, ['encrypt']
    );
    const encodedText = new TextEncoder().encode(plainText);
    const cipherBuffer = await window.crypto.subtle.encrypt(
      { name: GCM_ALGO, iv: iv, tagLength: GCM_TAG_LENGTH },
      cryptoKey,
      encodedText
    );
    const ciphertextB64 = bytesToBase64(new Uint8Array(cipherBuffer));

    // 4. Sign the ciphertext with RSA (SHA256withRSA)
    const signingKey = await importRSASigningKey(privateKeyBase64);
    const sigBuffer = await window.crypto.subtle.sign(
      RSASSA_PKCS1,
      signingKey,
      new TextEncoder().encode(ciphertextB64)
    );
    const signatureB64 = bytesToBase64(new Uint8Array(sigBuffer));

    // 5. RSA-OAEP encrypt the AES key with public key
    const rsaPublicKey = await importRSAPublicKey(publicKeyBase64);
    const encryptedKeyBuffer = await window.crypto.subtle.encrypt(
      RSA_OAEP,
      rsaPublicKey,
      aesKeyBytes
    );
    const headerKeyB64 = bytesToBase64(new Uint8Array(encryptedKeyBuffer));

    // 6. Combine: headerKey : ciphertext : signature
    const envelope = headerKeyB64 + RSA_SEPARATOR + ciphertextB64 + RSA_SEPARATOR + signatureB64;
    return btoa(envelope);
  } catch (error) {
    console.error('AES/RSA Encryption error:', error);
    throw new Error('AES/RSA Encryption failed: ' + error.message);
  }
}

/**
 * AES/GCM + RSA hybrid decryption (matches Java DecryptionUtil).
 *
 * Flow:
 * 1. Base64 decode the envelope, split on ':' into header, ciphertext, signature
 * 2. RSA-OAEP decrypt the header with private key to recover AES key
 * 3. Verify SHA256withRSA signature with public key
 * 4. Derive IV from first 16 bytes of recovered AES key
 * 5. AES/GCM decrypt the ciphertext
 *
 * @param {string} envelopeB64 - Base64-encoded envelope from encryptRSA
 * @param {string} privateKeyBase64 - RSA private key (PKCS#8 Base64) for header decryption
 * @param {string} publicKeyBase64 - RSA public key (SPKI Base64 or X.509 cert) for signature verification
 * @returns {string} Decrypted plaintext
 */
export async function decryptRSA(envelopeB64, privateKeyBase64, publicKeyBase64) {
  try {
    // 1. Decode and split envelope
    const envelope = atob(envelopeB64.trim());
    const parts = envelope.split(RSA_SEPARATOR);
    if (parts.length !== 3) {
      throw new Error('Invalid AES/RSA envelope format. Expected 3 colon-separated parts.');
    }
    const [headerKeyB64, ciphertextB64, signatureB64] = parts;

    // 2. RSA-OAEP decrypt header to recover AES key
    const privateKey = await importRSAPrivateKey(privateKeyBase64);
    const encryptedKeyBytes = base64ToBytes(headerKeyB64);
    const aesKeyBuffer = await window.crypto.subtle.decrypt(
      RSA_OAEP,
      privateKey,
      encryptedKeyBytes
    );
    const aesKeyBytes = new Uint8Array(aesKeyBuffer);

    // 3. Verify signature with public key
    const verifyKey = await importRSAVerifyKey(publicKeyBase64);
    const sigValid = await window.crypto.subtle.verify(
      RSASSA_PKCS1,
      verifyKey,
      base64ToBytes(signatureB64),
      new TextEncoder().encode(ciphertextB64)
    );
    if (!sigValid) {
      throw new Error('Signature verification failed. The data may have been tampered with.');
    }

    // 4. Derive IV from first 16 bytes of recovered AES key
    const iv = aesKeyBytes.slice(0, 16);

    // 5. AES/GCM decrypt the ciphertext
    const aesCryptoKey = await window.crypto.subtle.importKey(
      'raw', aesKeyBytes, { name: GCM_ALGO }, false, ['decrypt']
    );
    const cipherData = base64ToBytes(ciphertextB64);
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: GCM_ALGO, iv: iv, tagLength: GCM_TAG_LENGTH },
      aesCryptoKey,
      cipherData
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (error) {
    console.error('AES/RSA Decryption error:', error);
    if (error.name === 'OperationError' || error.name === 'DataError') {
      throw new Error('AES/RSA Decryption failed. Verify your private/public key pair and ensure the data was encrypted with AES/RSA.');
    }
    throw new Error('AES/RSA Decryption failed: ' + error.message);
  }
}
