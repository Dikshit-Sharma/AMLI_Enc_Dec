export const CREDENTIAL_KEYS = [
  'x-api-key', 'x-apigw-api-id', 'xapigwapiid',
  'clientid', 'client_id', 'client-id',
  'clientsecret', 'client_secret', 'client-secret',
  'appid', 'soaappid',
];

export function parseCurlForHeaders(curlString) {
  const headers = {};
  if (!curlString) return headers;
  const headerRegex = /-(?:H|-header)\s+["']([^"']+)["']/g;
  let match;
  while ((match = headerRegex.exec(curlString)) !== null) {
    const [key, ...values] = match[1].split(':');
    if (key && values.length) {
      headers[key.trim()] = values.join(':').trim();
    }
  }
  return headers;
}

export function parseCurlBody(curlString) {
  if (!curlString) return null;
  const bodyMatch = curlString.match(/-(?:d|-data(?:-raw)?)\s+["']({[\s\S]+?})["']/);
  if (!bodyMatch) return null;
  try {
    return JSON.parse(bodyMatch[1]);
  } catch {
    return null;
  }
}

export function findCredentialsInObject(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 3) return {};
  const found = {};
  for (const [key, value] of Object.entries(obj)) {
    const lk = key.toLowerCase();
    if (typeof value === 'string' && value.length > 0) {
      for (const ck of CREDENTIAL_KEYS) {
        if (lk === ck) found[ck] = value;
      }
    }
    if (typeof value === 'object') {
      const nested = findCredentialsInObject(value, depth + 1);
      Object.assign(found, nested);
    }
  }
  return found;
}

export function tryParseJson(str) {
  if (!str || typeof str !== 'string') return null;
  try { return JSON.parse(str); } catch { return null; }
}

export function extractFromArtifact(art) {
  if (!art.env) return null;
  const found = {};
  const headers = parseCurlForHeaders(art.curl);
  for (const [k, v] of Object.entries(headers)) {
    const lk = k.toLowerCase();
    for (const ck of CREDENTIAL_KEYS) {
      if (lk === ck) found[ck] = v;
    }
  }
  const body = parseCurlBody(art.curl);
  if (body) Object.assign(found, findCredentialsInObject(body));
  const responseObj = tryParseJson(art.response);
  if (responseObj) Object.assign(found, findCredentialsInObject(responseObj));
  if (Array.isArray(art.extraRequests)) {
    for (const extra of art.extraRequests) {
      if (extra.response) {
        const extraRes = tryParseJson(extra.response);
        if (extraRes) Object.assign(found, findCredentialsInObject(extraRes));
      }
    }
  }
  const xApiKey = found['x-api-key'] || found['x-apigw-api-id'] || found['xapigwapiid'] || '';
  const clientId = found['clientid'] || found['client_id'] || found['client-id'] || '';
  const clientSecret = found['clientsecret'] || found['client_secret'] || found['client-secret'] || '';
  const aesKey = art.aesKey || found['aeskey'] || '';
  const appId = found['soaappid'] || found['appid'] || '';
  if (!xApiKey && !clientId && !clientSecret && !aesKey) return null;
  return {
    id: `art_${art.id}`,
    soaAppId: appId || art.jiraTicket || 'Unknown',
    apiName: art.apiName || '',
    env: art.env,
    xApiKey, clientId, clientSecret, aesKey,
    _source: 'artifact',
  };
}

export function deduplicate(list) {
  const seen = new Set();
  return list.filter((item) => {
    const key = `${item.xApiKey}|${item.clientId}|${item.clientSecret}|${item.aesKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}