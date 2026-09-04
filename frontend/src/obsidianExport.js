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

/** Sanitize a string for use as an Obsidian file/folder name */
function sanitize(name) {
  return (name || 'Untitled')
    .replace(/[/\\:*?"<>|#^[\]]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '')
    .trim() || 'Untitled';
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

/** Mask a credential value: show first 4 + last 4 chars, mask the rest */
function maskCred(val) {
  if (!val) return '';
  const s = String(val);
  if (s.length <= 8) return '****';
  return s.slice(0, 4) + '*'.repeat(s.length - 8) + s.slice(-4);
}

/** Escape YAML special characters */
function yamlEscape(str) {
  if (!str) return '""';
  const s = String(str);
  if (/[:{}[\],&*?|>!%@`#-]/.test(s) || s.includes("'") || s.includes('"') || /^\d/.test(s)) {
    return `"${s.replace(/"/g, '\\"')}"`;
  }
  return `'${s}'`;
}

// ─── Markdown Generators ────────────────────────────────────────────────────

function buildFrontmatter(tags, extra = {}) {
  let fm = '---\n';
  fm += `tags: [${(tags || []).map(t => `'${t}'`).join(', ')}]\n`;
  for (const [k, v] of Object.entries(extra)) {
    fm += `${k}: ${yamlEscape(v)}\n`;
  }
  fm += '---\n\n';
  return fm;
}

/** Generate Dashboard.md -- the vault overview */
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
  md += `| [[Artifacts/_Index|Artifacts]] | ${artifacts.length} |\n`;
  md += `| [[BSA/_Index|BSA Entries]] | ${bsa.length} |\n`;
  md += `| [[Credentials/_Index|Credentials]] | ${credentials.length} |\n`;
  md += `| [[Clipboard/_Index|Clipboard Notes]] | ${clipboards.length} |\n`;

  md += '\n## Quick Links\n\n';
  md += '- [[Artifacts/_Index]] -- SOA documentation artifacts\n';
  md += '- [[BSA/_Index]] -- Business Stakeholder Alignment tracker\n';
  md += '- [[Credentials/_Index]] -- API credentials (masked)\n';
  md += '- [[Clipboard/_Index]] -- Collaborative rich-text notes\n';
  md += '- [[Changelog/Changelog]] -- Export history\n';

  return md;
}

/** Generate Artifacts/_Index.md */
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

  md += '| JIRA | API Name | Env | Encryption | Date |\n';
  md += '|---|---|---|---|---|\n';

  for (const art of artifacts) {
    const fname = `${sanitize(art.jiraTicket)}_${sanitize(art.apiName)}_${sanitize(art.env)}`;
    md += `| ${art.jiraTicket || '-'} | [[${fname}|${art.apiName || '-'}]] | ${art.env || '-'} | ${art.encryption || 'Disabled'} | ${fmtDate(art.timestamp)} |\n`;
  }

  return md;
}

/** Generate individual artifact note */
function generateArtifactNote(art) {
  let md = buildFrontmatter(['artifact', 'soa', art.env?.toLowerCase()], {
    'jira': art.jiraTicket || '',
    'api': art.apiName || '',
    'env': art.env || '',
    'encryption': art.encryption || 'Disabled',
    'algorithm': art.algo || '',
    'created': fmtDate(art.timestamp),
  });

  md += `# ${art.apiName || 'Unnamed API'}\n\n`;
  md += `**JIRA:** ${art.jiraTicket || '-'}  \n`;
  md += `**Environment:** ${art.env || '-'}  \n`;
  md += `**Encryption:** ${art.encryption || 'Disabled'}  \n`;

  if (art.algo) md += `**Algorithm:** ${art.algo}  \n`;
  md += `**Date:** ${fmtDateTime(art.timestamp)}  \n\n`;

  md += '---\n\n';

  // Parse curl
  if (art.curl) {
    md += '## Request\n\n';
    const parsed = parseCurlForObsidian(art.curl);
    if (parsed.url) md += `**URL:** \`${parsed.url}\`\n\n`;
    if (Object.keys(parsed.headers).length) {
      md += '### Headers\n\n';
      md += '```json\n';
      md += JSON.stringify(parsed.headers, null, 2);
      md += '\n```\n\n';
    }
    if (parsed.body) {
      md += '### Body\n\n';
      md += '```json\n';
      md += (typeof parsed.body === 'string' ? parsed.body : JSON.stringify(parsed.body, null, 2));
      md += '\n```\n\n';
    }
  }

  // Response
  if (art.response) {
    md += '## Response\n\n';
    let respFormatted = art.response;
    try {
      respFormatted = JSON.stringify(JSON.parse(art.response), null, 2);
    } catch { /* keep as-is */ }
    md += '```json\n';
    md += respFormatted;
    md += '\n```\n\n';
  }

  // Extra request/response pairs
  if (art.extraRequests?.length) {
    for (let i = 0; i < art.extraRequests.length; i++) {
      const extra = art.extraRequests[i];
      md += `## Request ${i + 2}\n\n`;
      if (extra.request) {
        let reqFormatted = extra.request;
        try { reqFormatted = JSON.stringify(JSON.parse(extra.request), null, 2); } catch { /* keep */ }
        md += '```json\n';
        md += reqFormatted;
        md += '\n```\n\n';
      }
      if (extra.response) {
        md += `### Response ${i + 2}\n\n`;
        let resFormatted = extra.response;
        try { resFormatted = JSON.stringify(JSON.parse(extra.response), null, 2); } catch { /* keep */ }
        md += '```json\n';
        md += resFormatted;
        md += '\n```\n\n';
      }
    }
  }

  return md;
}

/** Simple curl parser (inline to avoid circular deps) */
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

/** Generate BSA/_Index.md */
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
    const consumers = (entry.consumers || []).map(c => c.name).join(', ') || '-';
    const spocs = (entry.consumers || []).map(c => c.spoc).filter(Boolean).join(', ') || '-';
    md += `| [[${sanitize(entry.api)}|${entry.api}]] | ${consumers} | ${spocs} | ${fmtDate(entry.updatedAt || entry.createdAt)} |\n`;
  }

  return md;
}

/** Generate individual BSA note */
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
    md += '| Consumer | SPOC |\n';
    md += '|---|---|\n';
    for (const c of entry.consumers) {
      md += `| ${c.name || '-'} | ${c.spoc || '-'} |\n`;
    }
  } else {
    md += '_No consumers listed._\n';
  }

  return md;
}

/** Generate Credentials/_Index.md (all values masked) */
function generateCredentialsIndex(credentials) {
  let md = buildFrontmatter(['credentials', 'index', 'amli'], {
    'type': 'index',
    'count': String(credentials.length),
    'security': 'all values masked',
  });

  md += '# Credentials Index\n\n';
  md += '> **Security Notice:** All credential values are masked in this export.\n\n';

  if (!credentials.length) {
    md += '_No credentials found._\n';
    return md;
  }

  md += '| SOA App ID | API Name | Env | x-api-key | Client ID | Date |\n';
  md += '|---|---|---|---|---|---|\n';

  for (const cred of credentials) {
    const fname = `${sanitize(cred.soaAppId)}_${sanitize(cred.apiName)}_${sanitize(cred.env)}`;
    md += `| [[${fname}|${cred.soaAppId || '-'}]] | ${cred.apiName || '-'} | ${cred.env || '-'} | ${maskCred(cred.xApiKey)} | ${maskCred(cred.clientId)} | ${fmtDate(cred.createdAt)} |\n`;
  }

  return md;
}

/** Generate individual credential note (masked) */
function generateCredentialNote(cred) {
  let md = buildFrontmatter(['credential', 'secret', cred.env?.toLowerCase()], {
    'soa_app_id': cred.soaAppId || '',
    'api': cred.apiName || '',
    'env': cred.env || '',
    'security': 'masked',
    'created': fmtDate(cred.createdAt),
  });

  md += `# ${cred.soaAppId || 'Unnamed Credential'}\n\n`;
  md += '> **Security Notice:** Values are masked in this export. Do not commit this file to public repos.\n\n';

  md += `**SOA App ID:** ${cred.soaAppId || '-'}  \n`;
  md += `**API Name:** ${cred.apiName || '-'}  \n`;
  md += `**Environment:** ${cred.env || '-'}  \n`;
  md += `**Date:** ${fmtDateTime(cred.createdAt)}  \n\n`;

  md += '---\n\n';

  md += '## Credential Values\n\n';
  md += '| Field | Value |\n';
  md += '|---|---|\n';
  md += `| x-api-key | \`${maskCred(cred.xApiKey)}\` |\n`;
  md += `| client-id | \`${maskCred(cred.clientId)}\` |\n`;
  md += `| client-secret | \`${maskCred(cred.clientSecret)}\` |\n`;
  md += `| aes-key | \`${maskCred(cred.aesKey)}\` |\n`;

  return md;
}

/** Generate Clipboard/_Index.md */
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
    const fname = sanitize(cb.title || cb.id);
    md += `| [[${fname}]] | ${cb.version || 0} | ${fmtDate(cb.updatedAt)} |\n`;
  }

  return md;
}

/** Generate individual clipboard note */
function generateClipboardNote(cb) {
  let md = buildFrontmatter(['clipboard', 'note', 'amli'], {
    'title': cb.title || 'Untitled',
    'clipboard_id': cb.id || '',
    'version': String(cb.version || 0),
  });

  md += `# ${cb.title || 'Untitled Clipboard'}\n\n`;
  md += `**ID:** \`${cb.id || '-'}\`  \n`;
  md += `**Version:** ${cb.version || 0}  \n\n`;

  md += '---\n\n';

  // Convert HTML content to Markdown
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

/** Generate Changelog.md */
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

// ─── Clipboard API fetcher ──────────────────────────────────────────────────

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
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ─── Main Export Function ───────────────────────────────────────────────────

/**
 * Fetches all data and generates an Obsidian-compatible vault as a ZIP file.
 * @param {Object} options
 * @param {Function} options.onProgress - Callback with status messages
 * @returns {Promise<void>} Triggers download
 */
export async function exportToObsidian({ onProgress } = {}) {
  const log = (msg) => onProgress?.(msg);

  // 1. Fetch all data
  log('Fetching artifacts...');
  let artifacts = [];
  try {
    const artRes = await fetchArtifacts();
    const list = artRes.artifacts || [];
    // Fetch full details for each artifact
    artifacts = await Promise.all(
      list.map((a) => fetchArtifact(a.id).catch(() => a))
    );
  } catch (e) {
    console.warn('Failed to fetch artifacts:', e);
  }

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
      Promise.all(ENVS.map((env) => fetchCredentials(env).then((r) => r.credentials || []))),
      fetchExtractedCredentials(),
    ]);
    const manual = manualResults.flat();
    const extracted = extractedRes.credentials || {};
    const extractedFlat = ENVS.flatMap((env) => extracted[env] || []);

    // Deduplicate by id
    const seen = new Set();
    for (const c of [...manual, ...extractedFlat]) {
      const key = c.id || `${c.soaAppId}_${c.apiName}_${c.env}`;
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
    clipboards.map((cb) => fetchClipboardById(cb.id).then((full) => full || cb).catch(() => cb))
  );

  const data = { artifacts, bsa, credentials, clipboards: fullClipboards };
  const totalNotes = artifacts.length + bsa.length + credentials.length + fullClipboards.length + 3; // +3 for indexes + dashboard + changelog

  log(`Generating ${totalNotes} Obsidian notes...`);

  // 2. Build the ZIP
  const zip = new JSZip();
  const root = 'AMLI_Vault';

  // Dashboard
  zip.file(`${root}/Dashboard.md`, generateDashboard(data));

  // Artifacts
  for (const art of artifacts) {
    const fname = `${sanitize(art.jiraTicket)}_${sanitize(art.apiName)}_${sanitize(art.env)}`;
    zip.file(`${root}/Artifacts/${fname}.md`, generateArtifactNote(art));
  }
  zip.file(`${root}/Artifacts/_Index.md`, generateArtifactsIndex(artifacts));

  // BSA
  for (const entry of bsa) {
    zip.file(`${root}/BSA/${sanitize(entry.api)}.md`, generateBSANote(entry));
  }
  zip.file(`${root}/BSA/_Index.md`, generateBSAIndex(bsa));

  // Credentials (masked)
  for (const cred of credentials) {
    const fname = `${sanitize(cred.soaAppId)}_${sanitize(cred.apiName)}_${sanitize(cred.env)}`;
    zip.file(`${root}/Credentials/${fname}.md`, generateCredentialNote(cred));
  }
  zip.file(`${root}/Credentials/_Index.md`, generateCredentialsIndex(credentials));

  // Clipboards
  for (const cb of fullClipboards) {
    zip.file(`${root}/Clipboard/${sanitize(cb.title || cb.id)}.md`, generateClipboardNote(cb));
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
