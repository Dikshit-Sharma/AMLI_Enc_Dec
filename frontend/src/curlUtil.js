const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

export function validateCurl(curlString) {
  const errors = [];
  if (!curlString || !curlString.trim()) {
    errors.push({ line: 0, message: 'Curl command is empty', type: 'error' });
    return errors;
  }

  const trimmed = curlString.trim();

  // Check curl keyword
  if (!/^curl\b/i.test(trimmed)) {
    errors.push({ line: 1, message: 'Command must start with "curl"', type: 'error' });
  }

  // Check balanced quotes
  let inSingle = false;
  let inDouble = false;
  let sqStart = -1;
  let dqStart = -1;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    const prev = i > 0 ? trimmed[i - 1] : '';
    if (ch === "'" && !inDouble && prev !== '\\') {
      if (!inSingle) { inSingle = true; sqStart = i; }
      else { inSingle = false; sqStart = -1; }
    } else if (ch === '"' && !inSingle && prev !== '\\') {
      if (!inDouble) { inDouble = true; dqStart = i; }
      else { inDouble = false; dqStart = -1; }
    }
  }
  if (inSingle) {
    const lineNo = trimmed.slice(0, sqStart).split('\n').length;
    errors.push({ line: lineNo, message: 'Unclosed single quote', type: 'error' });
  }
  if (inDouble) {
    const lineNo = trimmed.slice(0, dqStart).split('\n').length;
    errors.push({ line: lineNo, message: 'Unclosed double quote', type: 'error' });
  }

  // Extract method
  let method = 'GET';
  const xMethod = trimmed.match(/(?:^|\s)-X\s+['"]?(\w+)['"]?/);
  if (xMethod) method = xMethod[1].toUpperCase();

  // Validate URL
  const urlMatch = trimmed.match(/(?:'|")(https?:\/\/[^'"]+)(?:'|")/);
  if (!urlMatch) {
    errors.push({ line: 1, message: 'No URL found (expected quoted URL like "https://..." )', type: 'error' });
  } else {
    const url = urlMatch[1];
    try { new URL(url); } catch {
      const lineNo = trimmed.slice(0, urlMatch.index).split('\n').length + 1;
      errors.push({ line: lineNo, message: 'Invalid URL format: ' + url, type: 'error' });
    }
  }

  // Check -H headers
  const headerRe = /(?:^|\s)-H\s+['"]([^'"]*)['"]/g;
  let hm;
  while ((hm = headerRe.exec(trimmed)) !== null) {
    const hdr = hm[1];
    const colonIdx = hdr.indexOf(':');
    if (colonIdx <= 0) {
      const lineNo = trimmed.slice(0, hm.index).split('\n').length + 1;
      errors.push({ line: lineNo, message: 'Invalid header format: "' + hdr + '" (expected "Key: Value")', type: 'error' });
    }
  }

  // Check -d / --data body
  const bodyRe = /(?:^|\s)-d\s+/g;
  let bm;
  while ((bm = bodyRe.exec(trimmed)) !== null) {
    const rest = trimmed.slice(bm.index + bm[0].length).trim();
    const bodyContent = rest.match(/^['"]([\s\S]*?)['"]/);
    if (!bodyContent) {
      const lineNo = trimmed.slice(0, bm.index).split('\n').length + 1;
      errors.push({ line: lineNo, message: 'Body after -d must be quoted', type: 'error' });
    }
  }

  // Warn if POST/PUT/PATCH without -d
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    const hasBody = /(?:^|\s)-d\b/.test(trimmed) || /(?:^|\s)--data\b/.test(trimmed);
    if (!hasBody) {
      errors.push({ line: 1, message: method + ' request without -d/--data body', type: 'warning' });
    }
  }

  // Check for unescaped braces in body (likely JSON)
  const bodySection = trimmed.match(/-(?:d|-data(?:-raw)?)\s+['"]([\s\S]*)['"]/);
  if (bodySection) {
    const body = bodySection[1];
    if (body.startsWith('{') || body.startsWith('[')) {
      try { JSON.parse(body); } catch {
        errors.push({ line: 1, message: 'Request body looks like JSON but is not valid', type: 'warning' });
      }
    }
  }

  return errors;
}

export function formatCurl(curlString) {
  if (!curlString || !curlString.trim()) return curlString;

  let trimmed = curlString.trim();

  // Extract parts
  let method = 'GET';
  const xMatch = trimmed.match(/(?:^|\s)-X\s+['"]?(\w+)['"]?/);
  if (xMatch) method = xMatch[1].toUpperCase();

  const urlMatch = trimmed.match(/['"](https?:\/\/[^'"]*)['"]/);
  const url = urlMatch ? urlMatch[1] : '';

  const headers = [];
  const headerRe = /(?:^|\s)-H\s+['"]([^'"]*)['"]/g;
  let hm;
  while ((hm = headerRe.exec(trimmed)) !== null) {
    headers.push(hm[1]);
  }

  const bodyMatch = trimmed.match(/-(?:d|-data(?:-raw)?)\s+(['"][\s\S]*?['"])/);
  const body = bodyMatch ? bodyMatch[1] : '';

  const hasInsecure = /--insecure\b/.test(trimmed);
  const hasSilent = /-s\b|--silent\b/.test(trimmed);
  const hasLocation = /-L\b|--location\b/.test(trimmed);
  const hasCompressed = /--compressed\b/.test(trimmed);

  let result = 'curl';
  const indent = '  ';

  if (hasSilent) result += ' -s';
  if (hasInsecure) result += ' --insecure';
  if (hasLocation) result += ' -L';

  if (url) result += " \\\n" + indent + "'" + url + "'";

  if (method !== 'GET') {
    result += " \\\n" + indent + "-X " + method;
  }

  for (var hi = 0; hi < headers.length; hi++) {
    result += " \\\n" + indent + "-H '" + headers[hi] + "'";
  }

  if (body) {
    result += " \\\n" + indent + "-d '" + body.slice(1, -1) + "'";
  }

  if (hasCompressed) {
    result += " \\\n" + indent + "--compressed";
  }

  return result;
}
