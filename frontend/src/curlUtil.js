function normalizeCurl(str) {
  return str.replace(/\\\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenizeCurl(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    if (/\s/.test(str[i])) { i++; continue; }
    if (str[i] === "'" || str[i] === '"') {
      var quote = str[i];
      var j = i + 1;
      while (j < str.length && str[j] !== quote) {
        if (str[j] === '\\') j++;
        j++;
      }
      tokens.push({ type: 'string', value: str.slice(i + 1, j), raw: str.slice(i, j + (str[j] === quote ? 1 : 0)) });
      i = str[j] === quote ? j + 1 : j;
    } else {
      var j2 = i;
      while (j2 < str.length && !/\s/.test(str[j2])) j2++;
      tokens.push({ type: 'word', value: str.slice(i, j2) });
      i = j2;
    }
  }
  return tokens;
}

function isUrl(val) {
  return /^https?:\/\//.test(val);
}

export function validateCurl(curlString) {
  var errors = [];
  if (!curlString || !curlString.trim()) {
    errors.push({ line: 0, message: 'Curl command is empty', type: 'error' });
    return errors;
  }

  var flat = normalizeCurl(curlString);

  if (!/^curl\b/i.test(flat)) {
    errors.push({ line: 1, message: 'Command must start with "curl"', type: 'error' });
  }

  // Check unbalanced quotes in original (multi-line aware)
  var inSingle = false, inDouble = false, sqLine = 0, dqLine = 0;
  var lines = curlString.split('\n');
  for (var li = 0; li < lines.length; li++) {
    var l = lines[li];
    for (var ci = 0; ci < l.length; ci++) {
      var ch = l[ci];
      var prev = ci > 0 ? l[ci - 1] : '';
      if (ch === "'" && !inDouble && prev !== '\\') {
        if (!inSingle) { inSingle = true; sqLine = li + 1; } else { inSingle = false; }
      } else if (ch === '"' && !inSingle && prev !== '\\') {
        if (!inDouble) { inDouble = true; dqLine = li + 1; } else { inDouble = false; }
      }
    }
  }
  if (inSingle) errors.push({ line: sqLine, message: 'Unclosed single quote', type: 'error' });
  if (inDouble) errors.push({ line: dqLine, message: 'Unclosed double quote', type: 'error' });
  if (inSingle || inDouble) return errors;

  var toks = tokenizeCurl(flat);
  if (toks.length === 0) return errors;

  // Find the URL token
  var foundUrl = false;
  for (var ti = 1; ti < toks.length; ti++) {
    if (isUrl(toks[ti].value) || isUrl(toks[ti].raw)) {
      foundUrl = true;
      try { new URL(toks[ti].value); } catch {
        errors.push({ line: 1, message: 'Invalid URL: ' + toks[ti].value, type: 'error' });
      }
      break;
    }
  }
  if (!foundUrl) {
    errors.push({ line: 1, message: 'No URL found (expected https://...)', type: 'error' });
  }

  // Parse flags
  var method = 'GET';
  var hasBody = false;
  for (ti = 0; ti < toks.length; ti++) {
    var t = toks[ti];
    if (t.type !== 'word') continue;
    if ((t.value === '-X' || t.value === '--request') && ti + 1 < toks.length) {
      method = toks[ti + 1].value.toUpperCase();
    }
    if (t.value === '-d' || t.value === '--data' || t.value === '--data-raw') {
      hasBody = true;
      var nextVal = ti + 1 < toks.length ? toks[ti + 1].value : '';
      if (nextVal.startsWith('{') || nextVal.startsWith('[')) {
        try { JSON.parse(nextVal); } catch {
          errors.push({ line: 1, message: 'Request body looks like JSON but is not valid', type: 'warning' });
        }
        // Check for content after closing brace before the quote end
        // e.g., -d '{"key":"value"} ' — trailing content inside quotes
        var rawVal = toks[ti + 1].raw || '';
        if (rawVal.length > 0) {
          var q = rawVal[0];
          var inner = rawVal.slice(1, rawVal[rawVal.length - 1] === q ? -1 : rawVal.length);
          var braceIdx = inner.lastIndexOf('}');
          var bracketIdx = inner.lastIndexOf(']');
          var endIdx = Math.max(braceIdx, bracketIdx);
          if (endIdx >= 0) {
            var afterContent = inner.slice(endIdx + 1);
            if (afterContent.trim().length > 0) {
              errors.push({ line: 1, message: 'Trailing content after JSON body: "' + afterContent + '" (check for space between } and closing quote)', type: 'error' });
            }
          }
        }
      }
    }
    if (t.value === '-H' || t.value === '--header') {
      if (ti + 1 < toks.length) {
        var hdr = toks[ti + 1].value;
        var colonIdx = hdr.indexOf(':');
        if (colonIdx <= 0) {
          errors.push({ line: 1, message: 'Invalid header: "' + hdr + '" (expected "Key: Value")', type: 'error' });
        }
      }
    }
  }

  if (['POST', 'PUT', 'PATCH'].indexOf(method) >= 0 && !hasBody) {
    errors.push({ line: 1, message: method + ' request without -d/--data body', type: 'warning' });
  }

  if (method === 'GET' && hasBody) {
    errors.push({ line: 1, message: 'Request has body but method is GET (did you forget -X POST?)', type: 'warning' });
  }

  return errors;
}
