import JSZip from 'jszip';

const SENSITIVE_KEYS = [
  'APPID',
  'SOAAPPID',
  'x-api-key',
  'clientId',
  'clientSecret',
  'x-apigw-api-id'
];

/**
 * Replaces a value with * characters of the same length.
 */
function maskValue(value) {
  if (value === null || value === undefined) return value;
  const str = String(value);
  return '*'.repeat(str.length);
}

/**
 * Recursively masks sensitive keys in an object.
 */
function maskSensitiveData(data) {
  if (!data || typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map(item => maskSensitiveData(item));
  }

  const masked = {};
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = SENSITIVE_KEYS.some(sk => sk.toLowerCase() === lowerKey);

      if (isSensitive) {
        masked[key] = maskValue(data[key]);
      } else if (typeof data[key] === 'object') {
        masked[key] = maskSensitiveData(data[key]);
      } else {
        masked[key] = data[key];
      }
    }
  }
  return masked;
}

/**
 * Creates a safe copy of an artifact with all sensitive credential values masked.
 * Keeps structure, URLs, header names, response schema — only replaces values
 * of known credential keys with '***'. Safe to send to third-party AI APIs.
 */
export function createSafeArtifactForAI(art) {
  if (!art) return art;
  const safe = { ...art };

  if (safe.aesKey) safe.aesKey = '***';
  if (safe.id) safe.id = '***';

  if (safe.curl) {
    const parsed = parseCurl(safe.curl);
    const maskedHeaders = maskSensitiveData(parsed.headers);
    const maskedBody = parsed.body ? maskSensitiveData(parsed.body) : null;
    safe.curl = JSON.stringify({ url: parsed.url, headers: maskedHeaders, body: maskedBody }, null, 2);
  }

  if (safe.response) {
    try {
      const parsed = JSON.parse(safe.response);
      safe.response = JSON.stringify(maskSensitiveData(parsed), null, 2);
    } catch { /* leave as-is if not valid JSON */ }
  }

  if (safe.extraRequests && Array.isArray(safe.extraRequests)) {
    safe.extraRequests = safe.extraRequests.map(extra => {
      const m = { ...extra };
      if (m.request) {
        try { const p = JSON.parse(m.request); m.request = JSON.stringify(maskSensitiveData(p), null, 2); }
        catch { /* keep */ }
      }
      if (m.response) {
        try { const p = JSON.parse(m.response); m.response = JSON.stringify(maskSensitiveData(p), null, 2); }
        catch { /* keep */ }
      }
      return m;
    });
  }

  return safe;
}

/**
 * Parses a curl command string to extract URL, Headers, and Body.
 */
export function parseCurl(curlString) {
  const result = {
    url: '',
    headers: {},
    body: null
  };

  if (!curlString) return result;

  // Extract URL (usually matches the first quoted string or follows 'curl' / -X / --url)
  const urlMatch = curlString.match(/(?:'|")([^'"]+)(?:'|")/);
  if (urlMatch) result.url = urlMatch[1];

  // Extract Headers (-H "Key: Value")
  const headerRegex = /-(?:H|-header)\s+["']([^"']+)["']/g;
  let match;
  while ((match = headerRegex.exec(curlString)) !== null) {
    const [key, ...values] = match[1].split(':');
    if (key && values.length) {
      result.headers[key.trim()] = values.join(':').trim();
    }
  }

  // Extract Body (--data / -d / --data-raw)
  const bodyMatch = curlString.match(/-(?:d|-data(?:-raw)?)\s+["']({[\s\S]+?})["']/);
  if (bodyMatch) {
    try {
      result.body = JSON.parse(bodyMatch[1]);
    } catch {
      result.body = bodyMatch[1]; // Keep as string if not valid JSON
    }
  }

  return result;
}

/**
 * Decrypts payload if needed and formats the artifact text.
 */
export async function generateArtifactText(artifact, decryptGCM, decryptCBC, shouldMask = false) {
  const { jiraTicket, apiName: _apiName, env, curl, response, encryption, aesKey, algo, numRequests, extraRequests } = artifact;
  const parsedCurl = parseCurl(curl);

  let resultText = `${jiraTicket} Artifacts (${env || 'DEV'})\n\n`;
  resultText += `API URL: ${parsedCurl.url}\n\n`;

  let finalHeaders = parsedCurl.headers || {};
  if (shouldMask) {
    finalHeaders = maskSensitiveData(finalHeaders);
  }

  const headerLines = Object.entries(finalHeaders)
    .map(([key, value]) => {
      if (key.toLowerCase() === 'authorization') {
        return `${key}:Bearer {{token}}`;
      }
      return `${key}:${value}`;
    })
    .join('\n');

  resultText += `HEADERS:\n${headerLines}\n\n`;

  // Helper to safely parse and stringify JSON
  const formatJSON = (val) => {
    try {
      return JSON.stringify(typeof val === 'string' ? JSON.parse(val) : val, null, 2);
    } catch {
      return val;
    }
  };

  const decryptFn = algo === 'CBC' ? decryptCBC : decryptGCM;

  // Process all request-response pairs
  const pairs = [
    { req: parsedCurl.body, res: response } // Pair 1
  ];

  if (numRequests > 1 && extraRequests) {
    extraRequests.forEach(item => {
      pairs.push({ req: item.request, res: item.response });
    });
  }

  for (let i = 0; i < pairs.length; i++) {
    const pairNum = i + 1;
    const reqObj = pairs[i].req;
    const resObj = pairs[i].res;

    let currentParsedReq;
    try {
      currentParsedReq = typeof reqObj === 'string' ? JSON.parse(reqObj) : reqObj;
    } catch {
      currentParsedReq = reqObj;
    }

    let currentParsedRes;
    try {
      currentParsedRes = typeof resObj === 'string' ? JSON.parse(resObj) : resObj;
    } catch {
      currentParsedRes = resObj;
    }

    if (encryption === 'Disabled') {
      const reqToDisplay = shouldMask ? maskSensitiveData(currentParsedReq || {}) : (currentParsedReq || {});
      const resToDisplay = shouldMask ? maskSensitiveData(currentParsedRes || {}) : (currentParsedRes || {});

      resultText += `REQUEST ${pairNum}:\n${formatJSON(reqToDisplay)}\n\n`;
      resultText += `RESPONSE ${pairNum}:\n${formatJSON(resToDisplay)}\n\n`;
    } else {
      // Encryption Enabled
      const encReqPayload = currentParsedReq?.request?.payload || '';
      const encResPayload = currentParsedRes?.response?.payload || '';

      let decReq = 'Decryption failed or payload missing';
      let decRes = 'Decryption failed or payload missing';

      if (encReqPayload && aesKey) {
        try {
          decReq = await decryptFn(encReqPayload, aesKey);
          decReq = formatJSON(decReq);
        } catch (e) { decReq = `Error: ${e.message}`; }
      }

      if (encResPayload && aesKey) {
        try {
          decRes = await decryptFn(encResPayload, aesKey);
          decRes = formatJSON(decRes);
        } catch (e) { decRes = `Error: ${e.message}`; }
      }

      let finalDecReq = decReq;
      let finalDecRes = decRes;

      if (shouldMask) {
        try {
          const parsedDecReq = typeof decReq === 'string' ? JSON.parse(decReq) : decReq;
          finalDecReq = formatJSON(maskSensitiveData(parsedDecReq));
        } catch { /* ignore if not JSON */ }

        try {
          const parsedDecRes = typeof decRes === 'string' ? JSON.parse(decRes) : decRes;
          finalDecRes = formatJSON(maskSensitiveData(parsedDecRes));
        } catch { /* ignore if not JSON */ }
      }

      resultText += `ENC REQUEST ${pairNum}:\n${formatJSON(currentParsedReq || {})}\n\n`;
      resultText += `ENC RESPONSE ${pairNum}:\n${formatJSON(currentParsedRes || {})}\n\n`;
      resultText += `DEC REQUEST ${pairNum}:\n${finalDecReq}\n\n`;
      resultText += `DEC RESPONSE ${pairNum}:\n${finalDecRes}\n\n`;
    }
  }

  return resultText.trim();
}

/**
 * Generates and triggers ZIP download for all artifacts.
 */
export async function generateAndDownloadZip(artifacts, decryptGCM, decryptCBC) {
  const firstArt = artifacts[0] || {};
  const jira = firstArt.jiraTicket || 'JIRA';
  const env = firstArt.env || 'DEV';
  const baseFileName = `${jira}_${env}_Artifacts`;

  const download = async (shouldMask, suffix = '') => {
    const zip = new JSZip();
    for (const art of artifacts) {
      const content = await generateArtifactText(art, decryptGCM, decryptCBC, shouldMask);
      const fileName = `${art.jiraTicket || 'JIRA'}_${art.apiName || 'API'}.txt`;
      zip.file(fileName, content);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${baseFileName}${suffix}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  // Download Original
  await download(false);

  // Download Masked
  await download(true, '_Masked');
}

/**
 * Generates a single ZIP containing original (unmasked) text for multiple artifacts.
 * Used for bulk export from the Library.
 */
export async function generateBulkZip(artifacts, decryptGCM, decryptCBC) {
  if (!artifacts?.length) return;
  const zip = new JSZip();
  for (const art of artifacts) {
    const content = await generateArtifactText(art, decryptGCM, decryptCBC, false);
    const fileName = `${art.jiraTicket || 'JIRA'}_${art.apiName || 'API'}.txt`;
    zip.file(fileName, content);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Bulk_Export_${artifacts.length}_artifacts.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
