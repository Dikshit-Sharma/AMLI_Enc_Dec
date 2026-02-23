import JSZip from 'jszip';

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
export async function generateArtifactText(artifact, decryptGCM, decryptCBC) {
  const { jiraTicket, apiName, curl, response, encryption, aesKey, algo, numRequests, extraRequests } = artifact;
  const parsedCurl = parseCurl(curl);

  let resultText = `${jiraTicket} Artifacts\n\n`;
  resultText += `API URL: ${parsedCurl.url}\n\n`;

  resultText += `HEADERS:\n${JSON.stringify(parsedCurl.headers, null, 2)}\n\n`;

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
      resultText += `REQUEST ${pairNum}:\n${formatJSON(currentParsedReq || {})}\n\n`;
      resultText += `RESPONSE ${pairNum}:\n${formatJSON(currentParsedRes || {})}\n\n`;
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

      resultText += `ENC REQUEST ${pairNum}:\n${formatJSON(currentParsedReq || {})}\n\n`;
      resultText += `ENC RESPONSE ${pairNum}:\n${formatJSON(currentParsedRes || {})}\n\n`;
      resultText += `DEC REQUEST ${pairNum}:\n${decReq}\n\n`;
      resultText += `DEC RESPONSE ${pairNum}:\n${decRes}\n\n`;
    }
  }

  return resultText.trim();
}

/**
 * Generates and triggers ZIP download for all artifacts.
 */
export async function generateAndDownloadZip(artifacts, decryptGCM, decryptCBC) {
  const zip = new JSZip();
  let firstJira = 'Artifacts';

  for (let i = 0; i < artifacts.length; i++) {
    const art = artifacts[i];
    if (i === 0 && art.jiraTicket) firstJira = art.jiraTicket;

    const content = await generateArtifactText(art, decryptGCM, decryptCBC);
    const fileName = `${art.jiraTicket || 'JIRA'}_${art.apiName || 'API'}.txt`;
    zip.file(fileName, content);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${firstJira}Artifacts.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
