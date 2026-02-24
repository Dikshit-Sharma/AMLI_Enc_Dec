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
    } catch (e) {
      result.body = bodyMatch[1]; // Keep as string if not valid JSON
    }
  }

  return result;
}

/**
 * Decrypts payload if needed and formats the artifact text.
 */
export async function generateArtifactText(artifact, decryptGCM, decryptCBC, shouldMask = false) {
  const { jiraTicket, apiName, env, curl, response, encryption, aesKey, algo, numRequests, extraRequests } = artifact;
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
    } catch (e) {
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
    } catch (e) {
      currentParsedReq = reqObj;
    }

    let currentParsedRes;
    try {
      currentParsedRes = typeof resObj === 'string' ? JSON.parse(resObj) : resObj;
    } catch (e) {
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
        } catch (e) { /* ignore if not JSON */ }

        try {
          const parsedDecRes = typeof decRes === 'string' ? JSON.parse(decRes) : decRes;
          finalDecRes = formatJSON(maskSensitiveData(parsedDecRes));
        } catch (e) { /* ignore if not JSON */ }
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
