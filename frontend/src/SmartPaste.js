import { useState, useRef } from 'react';
import { parseCurl } from './artifactUtil';

export function suggestApiName(url) {
  try {
    const path = new URL(url).pathname;
    const parts = path.split('/').filter(p => p && !/^v\d+$/.test(p));
    const last = parts[parts.length - 1] || parts[parts.length - 2] || 'API';
    return last
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .replace(/\s/g, '');
  } catch {
    return null;
  }
}

export function suggestEnv(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.includes('test') || hostname.includes('uat') || hostname.includes('staging')) return 'UAT';
    if (hostname.includes('localhost') || hostname === '127.0.0.1' || hostname.includes('dev') || hostname.includes('development')) return 'DEV';
    if (hostname.endsWith('.com') || hostname.includes('prod') || hostname.includes('api')) return 'PROD';
    return 'DEV';
  } catch {
    return null;
  }
}

export function matchFromLibrary(url, library) {
  if (!url || !library?.length) return null;
  const pathParts = url.split('/').filter(Boolean);
  for (const art of library) {
    if (!art.curl) continue;
    const parsed = parseCurl(art.curl);
    if (!parsed.url) continue;
    const libParts = parsed.url.split('/').filter(Boolean);
    const overlap = pathParts.filter(p => libParts.includes(p)).length;
    if (overlap >= 2) return art;
  }
  return null;
}

export default function useSmartPaste(library) {
  const [suggestion, setSuggestion] = useState(null);
  const lastCurlRef = useRef('');

  const handleCurlChange = (curl) => {
    if (!curl || curl === lastCurlRef.current) return;
    lastCurlRef.current = curl;

    const timer = setTimeout(() => {
      const parsed = parseCurl(curl);
      if (!parsed.url) return;

      const apiName = suggestApiName(parsed.url);
      const env = suggestEnv(parsed.url);
      const match = matchFromLibrary(parsed.url, library);

      setSuggestion({ apiName, env, match });
    }, 800);

    return () => clearTimeout(timer);
  };

  const applySuggestion = (updateField) => {
    if (!suggestion) return;
    if (suggestion.apiName) updateField('apiName', suggestion.apiName);
    if (suggestion.env) updateField('env', suggestion.env);
    setSuggestion(null);
  };

  const dismissSuggestion = () => setSuggestion(null);

  return { suggestion, handleCurlChange, applySuggestion, dismissSuggestion };
}
