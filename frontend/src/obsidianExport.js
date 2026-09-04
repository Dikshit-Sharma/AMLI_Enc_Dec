import JSZip from 'jszip';
import {
  fetchArtifacts,
  fetchArtifact,
  fetchCredentials,
  fetchExtractedCredentials,
  fetchBSAEntries,
  toDate,
} from './api';
import { htmlToMarkdown } from './markdownUtil';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Sanitize a string for use as an Obsidian file/folder name.
 * Replaces spaces, special characters, and path separators so wikilinks
 * always resolve reliably (no spaces/special chars in link targets).
 */
function sanitize(name) {
  const s = String(name == null ? '' : name)
    .replace(/\s+/g, '_')
    .replace(/[/\\:*?"<>|#^[\]]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .trim();
  return s || 'Untitled';
}

/** Escape a value safely for a Markdown table cell (pipes/newlines) */
function cell(val) {
  return String(val == null ? '' : val)
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
}

/** Format a Firestore-style timestamp to ISO date string */
function fmtDate(ts) {
  const d = toDate(ts);
  return d ? d.toISOString().slice(0, 10) : 'Unknown';
}

/** Format a timestamp to a human-readable datetime string */
function fmtDateTime(ts) {
  const d = toDate(ts);
  return d ? d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown';
}

/** Escape YAML special characters */
function yamlEscape(str) {
  if (str == null || str === '') return '""';
  const s = String(str);
  if (/[:{}[\],&*?|>!%@`#-]/.test(s) || s.includes("'") || s.includes('"') || /^\d/.test(s)) {
    return `"${s.replace(/"/g, '\\"')}"`;
  }
  return `'${s}'`;
}

/** Wrap a JSON string in a code fence, pretty-printing if it is valid JSON */
function jsonBlock(value) {
  let out = String(value == null ? '' : value);
  try {
    out = JSON.stringify(typeof value === 'string' ? JSON.parse(value) : value, null, 2);
  } catch { /* keep as-is */ }
  return '```json\n' + out + '\n```\n\n';
}

// ─── Markdown Building Blocks ───────────────────────────────────────────────

function buildFrontmatter(tags, extra = {}) {
  let fm = '---\n';
  fm += `tags:\n${(tags || []).map(t => `  - ${t}`).join('\n')}\n`;
  for (const [k, v] of Object.entries(extra)) {
    fm += `${k}: ${yamlEscape(v)}\n`;
  }
  fm += '---\n\n';
  return fm;
}

/**
 * Obsidian link safe for use INSIDE a Markdown table cell.
 * Obsidian treats `|` as a column separator, so the display-pipe of a wikilink
 * must be escaped as `\|` (or omit the display text). Bare links are safest.
 */
function tableLink(name, display) {
  const n = sanitize(name);
  if (display && display !== n) {
    return `[[${n}\\|${display}]]`;
  }
  return `[[${n}]]`;
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

function generateDashboard(data) {
  const { artifacts, bsa, credentials, clipboards } = data;
  let md = buildFrontmatter(['dashboard', 'amli'], {
    'created': new Date().toISOString().slice(0, 10),
    'type': 'dashboard',
  });

  md += '# AMLI Vault Dashboard\n\n';
  md += `> Exported from **AMLI Enc/Dec** on ${new Date().toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}\n\n`;

  md += '## Overview\n\n';
  md += '| Section | Count |\n';
  md += '|---|---|\n';
  md += `| [[Artifacts/_Index]] | ${artifacts.length} |\n`;
  md += `| [[BSA/_Index]] | ${bsa.length} |\n`;
  md += `| [[Credentials/_Index]] | ${credentials.length} |\n`;
  md += `| [[Clipboard/_Index]] | ${clipboards.length} |\n`;

  md += '\n## Quick Links\n\n';
  md += '- [[Artifacts/_Index]] -- SOA documentation artifacts\n';
  md += '- [[BSA/_Index]] -- Business Stakeholder Alignment tracker\n';
  md += '- [[Credentials/_Index]] -- API credentials\n';
  md += '- [[Clipboard/_Index]] -- Collaborative rich-text notes\n';
  md += '- [[Changelog/Changelog]] -- Export history\n';

  return md;
}

// ─── Artifacts ──────────────────────────────────────────────────────────────

/**
 * Build a unique, deterministic, Obsidian-safe filename for an artifact note.
 * `used` is a Set of already-used filenames; duplicate names get a numeric suffix.
 */
function artifactFileName(art, index, used) {
  let base = sanitize(art.jiraTicket) + '_' + sanitize(art.apiName) + '_' + sanitize(art.env);
  // If the meaningful name parts are all "Untitled", include the id + index
  if (base === 'Untitled_Untitled_Untitled') {
    base = `${sanitize(art.apiName) || 'Artifact'}_${art.id || index + 1}`;
  }

  if (used) {
    let candidate = base;
    let n = 2;
    while (used.has(candidate)) {
      candidate = `${base}_${n++}`;
    }
    used.add(candidate);
    return candidate;
  }
  return base;
}

/** Standardize an artifact object so it has all fields uniformly */
function normalizeArtifact(a) {
  if (a && a.artifact && typeof a.artifact === 'object') a = a.artifact;
  return a || {};
}

function generateArtifactsIndex(artifacts) {
  let md = buildFrontmatter(['artifacts', 'index', 'amli'], {
    'type': 'index',
    'count': String(artifacts.length),
  });

  md += '# Artifacts Index\n\n';
  md += `> ${artifacts.length} SOA documentation artifact(s)\n\n`;

  if (!artifacts.length) {
    md += '_No artifacts found._\n';
    return md;
  }

  md += '| # | JIRA | API Name | Env | Encryption | Date |\n';
  md += '|---|---|---|---|---|---|\n';

  artifacts.forEach((art, i) => {
    const n = sanitize(art.apiName) || 'Unnamed API';
    const fname = art._fname || artifactFileName(art, i);
    md += `| ${i + 1} | ${cell(art.jiraTicket || '-')} | ${tableLink(fname, n)} | ${cell(art.env || '-')} | ${cell(art.encryption || 'Disabled')} | ${fmtDate(art.timestamp)} |\n`;
  });

  return md;
}

function generateArtifactNote(art) {
  let md = buildFrontmatter(['artifact', 'soa', art.env?.toLowerCase() || 'unknown'], {
    'jira': art.jiraTicket || '',
    'api': art.apiName || '',
    'env': art.env || '',
    'encryption': art.encryption || 'Disabled',
    'algorithm': art.algo || '',
    'num_requests': art.numRequests != null ? String(art.numRequests) : '',
    'created': fmtDate(art.timestamp),
  });

  md += `# ${art.apiName || 'Unnamed API'}\n\n`;
  md += `**JIRA:** ${art.jiraTicket || '-'}  \n`;
  md += `**Environment:** ${art.env || '-'}  \n`;
  md += `**Encryption:** ${art.encryption || 'Disabled'}  \n`;
  if (art.algo) md += `**Algorithm:** ${art.algo}  \n`;
  if (art.numRequests != null) md += `**Request Count:** ${art.numRequests}  \n`;
  md += `**Date:** ${fmtDateTime(art.timestamp)}  \n\n`;

  md += '---\n\n';

  // Raw curl + parsed breakdown
  if (art.curl) {
    md += '## Request (curl)\n\n';
    md += '```bash\n' + art.curl + '\n```\n\n';

    const parsed = parseCurlForObsidian(art.curl);
    if (parsed.url) md += `**URL:** \`${parsed.url}\`\n\n`;
    if (Object.keys(parsed.headers).length) {
      md += '### Headers\n\n';
      md += '| Header | Value |\n';
      md += '|---|---|\n';
      for (const [k, v] of Object.entries(parsed.headers)) {
        md += `| \`${cell(k)}\` | \`${cell(v)}\` |\n`;
      }
      md += '\n';
    }
    if (parsed.body !== null && parsed.body !== undefined) {
      md += '### Body\n\n';
      md += jsonBlock(parsed.body);
    }
  }

  // Response
  if (art.response) {
    md += '## Response\n\n';
    md += jsonBlock(art.response);
  }

  // Extra request/response pairs
  const extra = Array.isArray(art.extraRequests) ? art.extraRequests : [];
  if (extra.length) {
    md += '## Additional Requests\n\n';
    extra.forEach((pair, i) => {
      const pairNum = i + 2;
      md += `### Request ${pairNum}\n\n`;
      if (pair.request) md += jsonBlock(pair.request);
      if (pair.response) {
        md += `### Response ${pairNum}\n\n`;
        md += jsonBlock(pair.response);
      }
    });
  }

  if (!art.curl && !art.response && !extra.length) {
    md += '_No request/response payloads captured._\n';
  }

  return md;
}

/** Simple curl parser */
function parseCurlForObsidian(curlString) {
  const result = { url: '', headers: {}, body: null };
  if (!curlString) return result;
  const urlMatch = curlString.match(/(?:'|")([^'"]+)(?:'|")/);
  if (urlMatch) result.url = urlMatch[1];
  const headerRegex = /-(?:H|-header)\s+["']([^"']+)["']/g;
  let match;
  while ((match = headerRegex.exec(curlString)) !== null) {
    const [key, ...values] = match[1].split(':');
    if (key && values.length) result.headers[key.trim()] = values.join(':').trim();
  }
  const bodyMatch = curlString.match(/-(?:d|-data(?:-raw)?)\s+["']({[\s\S]+?})\s*["']/);
  if (bodyMatch) {
    try { result.body = JSON.parse(bodyMatch[1]); } catch { result.body = bodyMatch[1]; }
  }
  return result;
}

// ─── BSA ────────────────────────────────────────────────────────────────────

function generateBSAIndex(bsaEntries) {
  let md = buildFrontmatter(['bsa', 'index', 'amli'], {
    'type': 'index',
    'count': String(bsaEntries.length),
  });

  md += '# BSA Entries Index\n\n';
  md += `> ${bsaEntries.length} Business Stakeholder Alignment entr(ies)\n\n`;

  if (!bsaEntries.length) {
    md += '_No BSA entries found._\n';
    return md;
  }

  md += '| API | Consumers | SPOCs | Date |\n';
  md += '|---|---|---|---|\n';

  for (const entry of bsaEntries) {
    const consumers = (entry.consumers || []).map(c => c.name).filter(Boolean);
    const spocs = (entry.consumers || []).map(c => c.spoc).filter(Boolean);
    md += `| ${tableLink(entry.api, entry.api || '-')} | ${cell(consumers.join(', ') || '-')} | ${cell(spocs.join(', ') || '-')} | ${fmtDate(entry.updatedAt || entry.createdAt)} |\n`;
  }

  return md;
}

function generateBSANote(entry) {
  let md = buildFrontmatter(['bsa', 'entry', 'amli'], {
    'api': entry.api || '',
    'created': fmtDate(entry.createdAt),
    'updated': fmtDate(entry.updatedAt),
  });

  md += `# ${entry.api || 'Unnamed API'}\n\n`;
  md += `**API:** ${entry.api || '-'}  \n`;
  md += `**Created:** ${fmtDateTime(entry.createdAt)}  \n`;
  md += `**Updated:** ${fmtDateTime(entry.updatedAt)}  \n\n`;

  md += '---\n\n';

  md += '## Consumers\n\n';
  if (entry.consumers?.length) {
    md += '| # | Consumer | SPOC |\n';
    md += '|---|---|---|\n';
    entry.consumers.forEach((c, i) => {
      md += `| ${i + 1} | ${cell(c.name || '-')} | ${cell(c.spoc || '-')} |\n`;
    });
  } else {
    md += '_No consumers listed._\n';
  }

  return md;
}

// ─── Credentials (UNMASKED) ─────────────────────────────────────────────────

function generateCredentialsIndex(credentials) {
  let md = buildFrontmatter(['credentials', 'index', 'amli'], {
    'type': 'index',
    'count': String(credentials.length),
  });

  md += '# Credentials Index\n\n';
  md += `> ${credentials.length} credential entr(ies)\n\n`;

  if (!credentials.length) {
    md += '_No credentials found._\n';
    return md;
  }

  md += '| SOA App ID | API Name | Env | x-api-key | Client ID | Date |\n';
  md += '|---|---|---|---|---|---|\n';

  for (const cred of credentials) {
    const fname = cred._fname || credentialFileName(cred);
    md += `| ${tableLink(fname, cred.soaAppId || '-')} | ${cell(cred.apiName || '-')} | ${cell(cred.env || '-')} | \`${cell(cred.xApiKey || '')}\` | \`${cell(cred.clientId || '')}\` | ${fmtDate(cred.createdAt)} |\n`;
  }

  return md;
}

function credentialFileName(cred, used) {
  let base = sanitize(cred.soaAppId) + '_' + sanitize(cred.apiName) + '_' + sanitize(cred.env);
  if (base === 'Untitled_Untitled_Untitled') {
    base = sanitize(cred.soaAppId) || sanitize(cred.id) || 'Credential';
  }
  if (used) {
    let candidate = base;
    let n = 2;
    while (used.has(candidate)) {
      candidate = `${base}_${n++}`;
    }
    used.add(candidate);
    return candidate;
  }
  return base;
}

function generateCredentialNote(cred) {
  let md = buildFrontmatter(['credential', cred.env?.toLowerCase() || 'unknown'], {
    'soa_app_id': cred.soaAppId || '',
    'api': cred.apiName || '',
    'env': cred.env || '',
    'created': fmtDate(cred.createdAt),
  });

  md += `# ${cred.soaAppId || 'Unnamed Credential'}\n\n`;
  md += `**SOA App ID:** ${cred.soaAppId || '-'}  \n`;
  md += `**API Name:** ${cred.apiName || '-'}  \n`;
  md += `**Environment:** ${cred.env || '-'}  \n`;
  md += `**Date:** ${fmtDateTime(cred.createdAt)}  \n\n`;

  md += '---\n\n';

  md += '## Credential Values\n\n';
  md += '| Field | Value |\n';
  md += '|---|---|\n';
  md += `| x-api-key | \`${cell(cred.xApiKey || '')}\` |\n`;
  md += `| client-id | \`${cell(cred.clientId || '')}\` |\n`;
  md += `| client-secret | \`${cell(cred.clientSecret || '')}\` |\n`;
  md += `| aes-key | \`${cell(cred.aesKey || '')}\` |\n`;

  return md;
}

// ─── Clipboard ──────────────────────────────────────────────────────────────

/** Unique clipboard filename: Title_ID8 (disambiguates duplicate titles) */
function clipboardFileName(cb) {
  const id8 = String(cb.id || '').slice(0, 8) || 'noid';
  const base = sanitize(cb.title || 'Untitled');
  return `${base}_${id8}`;
}

function generateClipboardIndex(clipboards) {
  let md = buildFrontmatter(['clipboard', 'index', 'amli'], {
    'type': 'index',
    'count': String(clipboards.length),
  });

  md += '# Clipboard Notes Index\n\n';
  md += `> ${clipboards.length} clipboard note(s)\n\n`;

  if (!clipboards.length) {
    md += '_No clipboard notes found._\n';
    return md;
  }

  md += '| Title | Version | Date |\n';
  md += '|---|---|---|\n';

  for (const cb of clipboards) {
    const fname = clipboardFileName(cb);
    const title = cb.title || 'Untitled Clipboard';
    md += `| ${tableLink(fname, title)} | ${cb.version || 0} | ${fmtDate(cb.updatedAt)} |\n`;
  }

  return md;
}

function generateClipboardNote(cb) {
  let md = buildFrontmatter(['clipboard', 'note', 'amli'], {
    'title': cb.title || 'Untitled',
    'clipboard_id': cb.id || '',
    'version': String(cb.version || 0),
  });

  md += `# ${cb.title || 'Untitled Clipboard'}\n\n`;
  md += `**ID:** \`${cb.id || '-'}\`  \n`;
  md += `**Version:** ${cb.version || 0}  \n`;

  if (cb.updatedAt) md += `**Updated:** ${fmtDateTime(cb.updatedAt)}  \n`;
  md += '\n---\n\n';

  if (cb.content) {
    try {
      md += htmlToMarkdown(cb.content);
    } catch {
      md += '> Failed to convert content to Markdown.\n\n';
      md += '```html\n';
      md += cb.content;
      md += '\n```\n';
    }
  } else {
    md += '_Empty clipboard._\n';
  }

  return md;
}

// ─── Changelog ──────────────────────────────────────────────────────────────

function generateChangelog(data) {
  const { artifacts, bsa, credentials, clipboards } = data;
  let md = buildFrontmatter(['changelog', 'amli'], {
    'type': 'changelog',
    'export_date': new Date().toISOString().slice(0, 10),
  });

  md += '# Changelog\n\n';
  md += `## Export - ${new Date().toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}\n\n`;
  md += '| Section | Count |\n';
  md += '|---|---|\n';
  md += `| Artifacts | ${artifacts.length} |\n`;
  md += `| BSA Entries | ${bsa.length} |\n`;
  md += `| Credentials | ${credentials.length} |\n`;
  md += `| Clipboard Notes | ${clipboards.length} |\n`;

  md += '\n---\n\n';
  md += '_This file is auto-generated by AMLI Enc/Dec Obsidian export._\n';

  return md;
}

// ─── Data Fetchers ──────────────────────────────────────────────────────────

async function fetchAllClipboards() {
  try {
    const res = await fetch('/api/clipboard');
    if (!res.ok) return [];
    const data = await res.json();
    return data.clipboards || [];
  } catch {
    return [];
  }
}

async function fetchClipboardById(id) {
  try {
    const res = await fetch(`/api/clipboard?id=${encodeURIComponent(id)}`);
    if (!res.ok) return {};
    const data = await res.json();
    return data || {};
  } catch {
    return {};
  }
}

// ─── Main Export Function ───────────────────────────────────────────────────

/**
 * Fetches all data and generates an Obsidian-compatible vault as a ZIP file.
 * Credentials are exported in full (unmasked). Artifact details are included.
 * @param {Object} options
 * @param {Function} options.onProgress - Callback with status messages
 * @returns {Promise<void>} Triggers download
 */
export async function exportToObsidian({ onProgress } = {}) {
  const log = (msg) => onProgress?.(msg);

  // 1. Fetch all data
  log('Fetching artifacts...');
  let rawArtifacts = [];
  try {
    // Paginate through ALL artifacts (the API returns max 20 per page by default)
    const list = [];
    let cursor = null;
    let more = true;
    let guard = 0;
    while (more && guard < 100) {
      guard += 1;
      const page = await fetchArtifacts({ limit: 100, cursor });
      const items = (page && page.artifacts) || [];
      list.push(...items);
      cursor = page && page.nextCursor ? page.nextCursor : null;
      more = Boolean(cursor) && items.length > 0;
    }

    // Fetch full details (curl/response/extraRequests) per artifact.
    // fetchArtifact returns { artifact: {...} }; fall back to list item on failure.
    rawArtifacts = await Promise.all(
      list.map(async (a) => {
        try {
          const full = await fetchArtifact(a.id);
          return full && full.artifact ? full.artifact : a;
        } catch {
          return a;
        }
      })
    );
  } catch (e) {
    console.warn('Failed to fetch artifacts:', e);
  }
  const artifacts = rawArtifacts.map(normalizeArtifact);

  // Assign unique filenames (dedup handles same jira+api+env appearing multiple times)
  const usedArtNames = new Set();
  artifacts.forEach((art, i) => {
    art._fname = artifactFileName(art, i, usedArtNames);
  });

  log('Fetching BSA entries...');
  let bsa = [];
  try {
    const bsaRes = await fetchBSAEntries();
    bsa = bsaRes.entries || [];
  } catch (e) {
    console.warn('Failed to fetch BSA entries:', e);
  }

  log('Fetching credentials...');
  let credentials = [];
  try {
    const ENVS = ['DEV', 'UAT', 'PROD'];
    const [manualResults, extractedRes] = await Promise.all([
      Promise.all(ENVS.map((env) => fetchCredentials(env).then((r) => r.credentials || []).catch(() => []))),
      fetchExtractedCredentials().catch(() => ({ credentials: {} })),
    ]);
    const manual = manualResults.flat();
    const extracted = (extractedRes && extractedRes.credentials) || {};
    const extractedFlat = ENVS.flatMap((env) => extracted[env] || []);

    // Deduplicate by id
    const seen = new Set();
    for (const c of [...manual, ...extractedFlat]) {
      const key = c.id || `${c.soaAppId}_${c.apiName}_${c.env}_${c.xApiKey}`;
      if (!seen.has(key)) {
        seen.add(key);
        credentials.push(c);
      }
    }
  } catch (e) {
    console.warn('Failed to fetch credentials:', e);
  }

  log('Fetching clipboard notes...');
  let clipboards = [];
  try {
    clipboards = await fetchAllClipboards();
  } catch (e) {
    console.warn('Failed to fetch clipboards:', e);
  }

  // Fetch full clipboard content
  log('Fetching clipboard content...');
  const fullClipboards = await Promise.all(
    clipboards.map((cb) => fetchClipboardById(cb.id).then((full) => ({ ...cb, ...full, id: cb.id })).catch(() => cb))
  );

  const data = { artifacts, bsa, credentials, clipboards: fullClipboards };
  const totalNotes = artifacts.length + bsa.length + credentials.length + fullClipboards.length + 4; // +4 indexes + dashboard + changelog

  log(`Generating ${totalNotes} Obsidian notes...`);

  // 2. Build the ZIP
  const zip = new JSZip();
  const root = 'AMLI_Vault';

  // Dashboard
  zip.file(`${root}/Dashboard.md`, generateDashboard(data));

  // Artifacts
  artifacts.forEach((art) => {
    zip.file(`${root}/Artifacts/${art._fname}.md`, generateArtifactNote(art));
  });
  zip.file(`${root}/Artifacts/_Index.md`, generateArtifactsIndex(artifacts));

  // BSA
  for (const entry of bsa) {
    zip.file(`${root}/BSA/${sanitize(entry.api)}.md`, generateBSANote(entry));
  }
  zip.file(`${root}/BSA/_Index.md`, generateBSAIndex(bsa));

  // Credentials (unmasked)
  const usedCredNames = new Set();
  for (const cred of credentials) {
    cred._fname = credentialFileName(cred, usedCredNames);
    zip.file(`${root}/Credentials/${cred._fname}.md`, generateCredentialNote(cred));
  }
  zip.file(`${root}/Credentials/_Index.md`, generateCredentialsIndex(credentials));

  // Clipboards
  for (const cb of fullClipboards) {
    zip.file(`${root}/Clipboard/${clipboardFileName(cb)}.md`, generateClipboardNote(cb));
  }
  zip.file(`${root}/Clipboard/_Index.md`, generateClipboardIndex(fullClipboards));

  // Changelog
  zip.file(`${root}/Changelog/Changelog.md`, generateChangelog(data));

  // 3. Generate and download the ZIP
  log('Packaging ZIP file...');
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `AMLI_Obsidian_Vault_${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);

  log(`Export complete! ${totalNotes} notes exported.`);
  return data;
}
