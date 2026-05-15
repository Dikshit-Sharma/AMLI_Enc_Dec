// ─── State ──────────────────────────────────────────────
const STORAGE_KEY = 'reposcope_form';
let abortController = null;
let cachedData = null;
let currentTheme = 'light';

// ─── DOM shortcuts ──────────────────────────────────────
const $ = id => document.getElementById(id);
const show = id => $(id).style.display = '';
const hide = id => $(id).style.display = 'none';

// ─── Theme ───────────────────────────────────────────────
function toggleTheme() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);
  $('themeToggle').textContent = currentTheme === 'dark' ? '🌙' : '☀️';
  try { localStorage.setItem('reposcope_theme', currentTheme); } catch {}
}

$('themeToggle').addEventListener('click', toggleTheme);
try {
  const saved = localStorage.getItem('reposcope_theme');
  if (saved) { currentTheme = saved; document.documentElement.setAttribute('data-theme', currentTheme); $('themeToggle').textContent = currentTheme === 'dark' ? '🌙' : '☀️'; }
} catch {}

// ─── Form persistence ────────────────────────────────────
function loadForm() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    ['baseUrl', 'token', 'username', 'commitAuthor', 'startDate', 'endDate', 'reportType'].forEach(k => {
      if (saved[k] !== undefined) $(k).value = saved[k];
    });
  } catch {}
}

function saveForm() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      baseUrl: $('baseUrl').value, token: $('token').value, username: $('username').value,
      commitAuthor: $('commitAuthor').value, startDate: $('startDate').value,
      endDate: $('endDate').value, reportType: $('reportType').value,
    }));
  } catch {}
}

loadForm();
['baseUrl','token','username','commitAuthor','startDate','endDate','reportType'].forEach(id =>
  $(id).addEventListener('input', saveForm)
);

// ─── Tab navigation ─────────────────────────────────────
$('tabBar').addEventListener('click', e => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  $(`tab-${btn.dataset.tab}`).classList.add('active');
});

// ─── Help ────────────────────────────────────────────────
$('helpBtn').addEventListener('click', () => {
  alert(
    'RepoScope — GitLab Analytics Dashboard\n\n' +
    '1. Enter GitLab URL, token, and username\n' +
    '2. Choose By MR (merge requests) or By Commit\n' +
    '3. Set a date range and click Generate\n\n' +
    'Tabs:\n' +
    '  Overview — summary cards, language treemap, bus factor, project bars\n' +
    '  Activity — GitHub-style heatmap per project\n' +
    '  Projects — per-project table + review flow graph\n' +
    '  Contributors — contributor line distribution + project count\n' +
    '  Explorer — click a project name to see its file tree mindmap\n\n' +
    'Theme toggle available in the top bar.'
  );
});

// ─── Report type toggle ──────────────────────────────────
$('reportType').addEventListener('change', () => {
  $('commitAuthorRow').style.display = $('reportType').value === 'commit' ? '' : 'none';
});

// ─── Fetch button ────────────────────────────────────────
$('fetchBtn').addEventListener('click', startReport);
$('cancelBtn').addEventListener('click', () => {
  if (abortController) { abortController.abort(); abortController = null; }
});

// ─── GitLab API ──────────────────────────────────────────
async function apiFetch(baseUrl, endpoint, params, token, signal) {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`);
  if (params) Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') url.searchParams.set(k, v); });
  const res = await fetch(url, { headers: { 'PRIVATE-TOKEN': token }, signal });
  if (!res.ok) {
    let body;
    try { body = await res.text(); } catch { body = ''; }
    throw new Error(`GitLab API ${res.status}${body ? ': ' + body.slice(0, 200) : ''}`);
  }
  return res;
}

async function paginate(baseUrl, endpoint, params, token, signal) {
  const items = [];
  let page = 1;
  const perPage = 100;
  while (true) {
    if (signal && signal.aborted) throw new Error('Cancelled');
    const res = await apiFetch(baseUrl, endpoint, { ...params, page, per_page: perPage }, token, signal);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    items.push(...data);
    if (data.length < perPage) break;
    page++;
  }
  return items;
}

function setProgress(pct, text) {
  $('progressBar').style.width = pct + '%';
  $('progressText').textContent = text;
}

// ─── Diff parser ─────────────────────────────────────────
const DIFF_HEADERS = ['diff --git', 'index ', '--- ', '+++ ', '@@', '\\ No newline at end of file', 'Binary files '];
const isHeader = l => DIFF_HEADERS.some(p => l.startsWith(p));

function countDiff(diffText) {
  const lines = diffText.split('\n');
  let additions = 0, deletions = 0, modified = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isHeader(line) || line.startsWith(' ') || line === '') continue;
    if (line.startsWith('-') && !line.startsWith('---')) {
      if (i + 1 < lines.length && lines[i + 1].startsWith('+') && !lines[i + 1].startsWith('+++')) {
        modified++; i++; continue;
      }
      deletions++;
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
    }
  }
  return { additions, deletions, modified };
}

function parseFileChanges(changes) {
  const results = [];
  for (const change of (changes || [])) {
    const filePath = change.new_path || change.old_path || 'UNKNOWN';
    const { additions, deletions, modified } = countDiff(change.diff || '');
    const ext = filePath.includes('.') ? filePath.split('.').pop().toLowerCase() : '?';
    results.push({ file: filePath, ext, dir: filePath.includes('/') ? filePath.split('/')[0] : '/', added: additions, deleted: deletions, modified, net: additions + modified - deletions });
  }
  return results;
}

// ─── Helpers ─────────────────────────────────────────────
function escHtml(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmt(n) { return (n === undefined || n === null ? 0 : Number(n)).toLocaleString('en-IN'); }
function pct(a, b) { return b === 0 ? 0 : Math.round((a / b) * 100); }

const PROJECT_COLORS = [
  '#6366f1','#22d3ee','#f59e0b','#ef4444','#10b981','#ec4899','#8b5cf6','#14b8a6',
  '#f97316','#06b6d4','#84cc16','#d946ef','#0ea5e9','#eab308','#64748b','#a855f7',
];

function getProjectColor(idx) { return PROJECT_COLORS[idx % PROJECT_COLORS.length]; }

function groupBy(arr, fn) {
  const map = {};
  for (const item of arr) {
    const key = fn(item);
    if (!map[key]) map[key] = [];
    map[key].push(item);
  }
  return map;
}

// ─── SVG rendering utilities ─────────────────────────────
function svg(tag, attrs, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  for (const c of children) { if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
  return el;
}

function renderBarChart(container, data, { valueKey, labelKey, maxBar, height = 200, color, format } = {}) {
  const max = Math.max(...data.map(d => d[valueKey]), 1);
  const barH = Math.min(28, (height - 20) / data.length);
  const pad = 4;
  const labelW = 140;
  const svgEl = svg('svg', { width: '100%', height: Math.max(height, data.length * (barH + pad) + 20) });

  data.forEach((d, i) => {
    const y = 10 + i * (barH + pad);
    const w = maxBar ? (d[valueKey] / max) * (maxBar - labelW) : (d[valueKey] / max) * 300;
    svgEl.appendChild(svg('text', { x: labelW - 6, y: y + barH - 4, 'text-anchor': 'end', fill: 'var(--text)', 'font-size': '11', 'font-weight': '600' }, String(d[labelKey])));
    svgEl.appendChild(svg('rect', { x: labelW, y, width: Math.max(w, 2), height: barH, rx: '3', fill: color || 'var(--primary)', opacity: '0.7' }));
    svgEl.appendChild(svg('text', { x: labelW + Math.max(w, 2) + 6, y: y + barH - 4, fill: 'var(--text-muted)', 'font-size': '10', 'font-weight': '700' }, String(d[valueKey])));
  });
  container.innerHTML = '';
  container.appendChild(svgEl);
}

// ─── Main report entry ──────────────────────────────────
async function startReport() {
  const baseUrl = $('baseUrl').value.trim();
  const token = $('token').value.trim();
  const username = $('username').value.trim();
  const startDate = $('startDate').value;
  const endDate = $('endDate').value;
  const reportType = $('reportType').value;

  if (!baseUrl || !token || !username || !startDate || !endDate) { alert('All fields are required.'); return; }
  if (endDate < startDate) { alert('End date must be >= start date.'); return; }
  if (reportType === 'commit' && !$('commitAuthor').value.trim()) { alert('Commit Author is required for BY COMMIT mode.'); return; }

  abortController = new AbortController();
  const signal = abortController.signal;

  hide('errorSection');
  hide('dashboardSection');
  show('progressSection');
  $('fetchBtn').disabled = true;
  $('cancelBtn').style.display = '';

  try {
    setProgress(3, 'Searching for user...');
    const usersRes = await apiFetch(baseUrl, '/users', { search: username }, token, signal);
    const users = await usersRes.json();
    if (!Array.isArray(users) || users.length === 0) throw new Error(`User not found: ${username}`);
    const user = users[0];
    setProgress(5, `Found user: ${user.name}`);

    setProgress(8, 'Fetching projects...');
    const projects = await paginate(baseUrl, '/projects', { membership: true }, token, signal);
    if (projects.length === 0) throw new Error('No membership projects found.');

    const data = reportType === 'mr'
      ? await generateMRReport(baseUrl, token, user, projects, startDate, endDate, signal)
      : await generateCommitReport(baseUrl, token, user, projects, startDate, endDate, signal);

    cachedData = data;

    setProgress(97, 'Rendering dashboard...');
    hide('progressSection');
    show('dashboardSection');
    renderDashboard(data, reportType);

  } catch (err) {
    if (err.message === 'Cancelled') {
      setProgress(0, 'Cancelled.');
      setTimeout(() => hide('progressSection'), 1500);
    } else {
      hide('progressSection');
      const es = $('errorSection'); es.style.display = ''; es.innerHTML = `<div class="error-banner">${escHtml(err.message)}</div>`;
    }
  } finally {
    $('fetchBtn').disabled = false;
    $('cancelBtn').style.display = 'none';
    abortController = null;
  }
}

// ─── MR report generator ────────────────────────────────
async function generateMRReport(baseUrl, token, user, projects, startDate, endDate, signal) {
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T23:59:59Z');
  const userId = user.id;

  const mrRows = [];
  const fileRows = [];
  const projectMap = {};
  const weeklyData = {};
  const contributorData = {};
  let grandAdded = 0, grandDeleted = 0, grandModified = 0;
  let scanned = 0;

  for (const proj of projects) {
    if (signal.aborted) throw new Error('Cancelled');
    const pct = 10 + Math.round((scanned / projects.length) * 80);
    const projName = proj.name || proj.path_with_namespace || `Project ${proj.id}`;
    setProgress(pct, `[${scanned + 1}/${projects.length}] ${projName}...`);

    const mrs = await paginate(baseUrl, `/projects/${proj.id}/merge_requests`, {
      author_id: userId, state: 'merged', per_page: 100,
    }, token, signal);

    let pAdded = 0, pDeleted = 0, pModified = 0, pMRs = 0;
    const projFileTypes = {};

    for (const mr of mrs) {
      if (signal.aborted) throw new Error('Cancelled');
      if (!mr.merged_at) continue;
      const mergedDate = new Date(mr.merged_at);
      if (mergedDate < start || mergedDate > end) continue;

      const changesRes = await apiFetch(baseUrl, `/projects/${proj.id}/merge_requests/${mr.iid}/changes`, {}, token, signal);
      const changesData = await changesRes.json();
      const fileStats = parseFileChanges(changesData.changes || []);

      const mrAdded = fileStats.reduce((s, f) => s + f.added, 0);
      const mrDeleted = fileStats.reduce((s, f) => s + f.deleted, 0);
      const mrModified = fileStats.reduce((s, f) => s + f.modified, 0);
      const mrNet = mrAdded + mrModified - mrDeleted;

      for (const fs of fileStats) {
        projFileTypes[fs.ext] = (projFileTypes[fs.ext] || 0) + 1;
      }

      grandAdded += mrAdded; grandDeleted += mrDeleted; grandModified += mrModified;
      pAdded += mrAdded; pDeleted += mrDeleted; pModified += mrModified; pMRs++;

      // Weekly
      const weekKey = getWeekKey(mergedDate);
      if (!weeklyData[weekKey]) weeklyData[weekKey] = {};
      if (!weeklyData[weekKey][projName]) weeklyData[weekKey][projName] = 0;
      weeklyData[weekKey][projName]++;

      // Contributors (from merge request author / reviewers)
      if (mr.author?.username) {
        if (!contributorData[mr.author.username]) contributorData[mr.author.username] = { name: mr.author.name || mr.author.username, added: 0, deleted: 0, projects: new Set(), mrCount: 0 };
        contributorData[mr.author.username].added += mrAdded;
        contributorData[mr.author.username].deleted += mrDeleted;
        contributorData[mr.author.username].projects.add(projName);
        contributorData[mr.author.username].mrCount++;
      }

      mrRows.push({
        project_name: projName, project_id: proj.id, mr_iid: mr.iid,
        mr_title: mr.title || '', merged_at: mr.merged_at,
        added: mrAdded, deleted: mrDeleted, modified: mrModified, net_loc: mrNet,
        author: mr.author?.username || 'unknown',
      });

      for (const fs of fileStats) {
        fileRows.push({ project_name: projName, project_id: proj.id, id: mr.iid, idLabel: `!${mr.iid}`, ...fs });
      }
    }

    if (pMRs > 0) {
      const sorted = Object.entries(projFileTypes).sort((a, b) => b[1] - a[1]);
      projectMap[proj.id] = { name: projName, count: pMRs, added: pAdded, deleted: pDeleted, modified: pModified, fileTypes: sorted };
    }
    scanned++;
  }

  // Collect projects list from weeklyData
  const allProjNames = [...new Set(Object.values(weeklyData).flatMap(w => Object.keys(w)))];

  return {
    type: 'mr',
    totals: {
      total_added: grandAdded, total_deleted: grandDeleted, total_modified: grandModified,
      total_net: grandAdded + grandModified - grandDeleted, total_items: mrRows.length, total_projects: Object.keys(projectMap).length,
    },
    detailRows: mrRows, fileRows, projectMap, weeklyData, allProjNames,
    contributorData: Object.fromEntries(Object.entries(contributorData).map(([k, v]) => [k, { ...v, projects: [...v.projects] }])),
  };
}

// ─── Commit report generator ─────────────────────────────
async function generateCommitReport(baseUrl, token, user, projects, startDate, endDate, signal) {
  const commitAuthor = $('commitAuthor').value.trim();
  const since = startDate + 'T00:00:00Z';
  const until = endDate + 'T23:59:59Z';

  const commitRows = [];
  const fileRows = [];
  const projectMap = {};
  const weeklyData = {};
  const contributorData = {};
  let grandAdded = 0, grandDeleted = 0;
  let scanned = 0;

  for (const proj of projects) {
    if (signal.aborted) throw new Error('Cancelled');
    const pct = 10 + Math.round((scanned / projects.length) * 80);
    const projName = proj.name || proj.path_with_namespace || `Project ${proj.id}`;
    setProgress(pct, `[${scanned + 1}/${projects.length}] ${projName}...`);

    const commits = await paginate(baseUrl, `/projects/${proj.id}/repository/commits`, {
      author: commitAuthor, since, until, all: 'true', with_stats: 'true',
    }, token, signal);

    let pAdded = 0, pDeleted = 0, pCommits = 0;

    for (const commit of commits) {
      if (signal.aborted) throw new Error('Cancelled');
      const stats = commit.stats || { additions: 0, deletions: 0, total: 0 };

      grandAdded += stats.additions; grandDeleted += stats.deletions;
      pAdded += stats.additions; pDeleted += stats.deletions; pCommits++;

      const shortId = commit.short_id || (commit.id ? commit.id.slice(0, 8) : '??');

      // Weekly
      const d = new Date(commit.created_at);
      const weekKey = getWeekKey(d);
      if (!weeklyData[weekKey]) weeklyData[weekKey] = {};
      if (!weeklyData[weekKey][projName]) weeklyData[weekKey][projName] = 0;
      weeklyData[weekKey][projName]++;

      if (commit.author_email) {
        const authorName = commit.author_name || commit.author_email;
        if (!contributorData[commit.author_email]) contributorData[commit.author_email] = { name: authorName, added: 0, deleted: 0, projects: new Set(), mrCount: 0 };
        contributorData[commit.author_email].added += stats.additions;
        contributorData[commit.author_email].deleted += stats.deletions;
        contributorData[commit.author_email].projects.add(projName);
      }

      commitRows.push({
        project_name: projName, project_id: proj.id,
        commit_id: commit.id, commit_short: shortId, commit_title: commit.title || '',
        committed_at: commit.created_at || '',
        additions: stats.additions, deletions: stats.deletions, total: stats.total,
      });

      try {
        const diffRes = await apiFetch(baseUrl, `/projects/${proj.id}/repository/commits/${commit.id}/diff`, {}, token, signal);
        const diffs = await diffRes.json();
        if (Array.isArray(diffs)) {
          for (const diff of diffs) {
            const { additions: fa, deletions: fd, modified: fm } = countDiff(diff.diff || '');
            const fp = diff.new_path || diff.old_path || 'UNKNOWN';
            const ext = fp.includes('.') ? fp.split('.').pop().toLowerCase() : '?';
            const dir = fp.includes('/') ? fp.split('/')[0] : '/';
            fileRows.push({ project_name: projName, project_id: proj.id, id: shortId, idLabel: shortId, file: fp, ext, dir, added: fa, deleted: fd, modified: fm, net: fa + fm - fd });
          }
        }
      } catch {}
    }

    if (pCommits > 0) {
      projectMap[proj.id] = { name: projName, count: pCommits, added: pAdded, deleted: pDeleted, modified: 0, fileTypes: calcFileTypes(fileRows.filter(r => r.project_name === projName)) };
    }
    scanned++;
  }

  const allProjNames = [...new Set(Object.values(weeklyData).flatMap(w => Object.keys(w)))];

  return {
    type: 'commit',
    totals: {
      total_added: grandAdded, total_deleted: grandDeleted, total_modified: 0,
      total_net: grandAdded - grandDeleted, total_items: commitRows.length, total_projects: Object.keys(projectMap).length,
    },
    detailRows: commitRows, fileRows, projectMap, weeklyData, allProjNames,
    contributorData: Object.fromEntries(Object.entries(contributorData).map(([k, v]) => [k, { ...v, projects: [...v.projects] }])),
  };
}

function getWeekKey(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d.setDate(diff));
  return mon.toISOString().slice(0, 10);
}

function calcFileTypes(fileStats) {
  const map = {};
  for (const f of fileStats || []) {
    map[f.ext] = (map[f.ext] || 0) + 1;
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

// ═══════════════════════════════════════════════════════════
//  DASHBOARD RENDER
// ═══════════════════════════════════════════════════════════

function renderDashboard(data, reportType) {
  const { totals, projectMap, fileRows, detailRows, weeklyData, allProjNames, contributorData } = data;
  const isMR = reportType === 'mr';

  // Summary cards
  $('summaryGrid').innerHTML = `
    <div class="summary-card sc-added"><div class="sc-value">${fmt(totals.total_added)}</div><div class="sc-label">Lines Added</div></div>
    <div class="summary-card sc-deleted"><div class="sc-value">${fmt(totals.total_deleted)}</div><div class="sc-label">Lines Deleted</div></div>
    <div class="summary-card sc-net"><div class="sc-value">${fmt(totals.total_net)}</div><div class="sc-label">Net LOC</div></div>
    <div class="summary-card sc-items"><div class="sc-value">${fmt(totals.total_items)}</div><div class="sc-label">${isMR ? 'MRs' : 'Commits'}</div></div>
    <div class="summary-card sc-projects"><div class="sc-value">${fmt(totals.total_projects)}</div><div class="sc-label">Projects</div></div>
  `;

  // Language treemap
  renderTreemap($('treemapChart'), fileRows);

  // Bus factor bubble chart
  renderBubbleChart($('bubbleChart'), Object.values(projectMap));

  // Project bar chart
  const projEntries = Object.values(projectMap).sort((a, b) => b.count - a.count);
  renderBarChart($('projectBarChart'), projEntries.slice(0, 12), { valueKey: 'count', labelKey: 'name', maxBar: 500, height: projEntries.length > 6 ? 300 : 200 });

  // Activity calendar
  renderActivityCalendar($('calendarChart'), weeklyData, allProjNames);

  // Project table
  renderProjectTable($('projectTableWrap'), projEntries, isMR, data);

  // Review flow
  if (isMR) renderReviewFlow($('reviewFlowChart'), detailRows, Object.values(projectMap));

  // Contributor charts
  const contribs = Object.values(contributorData).sort((a, b) => b.added - a.added);
  renderBarChart($('contributorChart'), contribs.slice(0, 10), { valueKey: 'added', labelKey: 'name', maxBar: 400, height: Math.max(200, contribs.length * 32) });
  renderBarChart($('contributorProjectsChart'), contribs.slice(0, 10).map(c => ({ name: c.name, projects: c.projects.length })), { valueKey: 'projects', labelKey: 'name', maxBar: 400, height: Math.max(200, contribs.length * 32), color: 'var(--secondary)' });

  // Explorer
  $('explorerBody').innerHTML = `<div class="chart-empty">Click a project name in the Projects tab to explore its file tree here</div>`;
}

// ─── 1. Language Treemap ─────────────────────────────────
function renderTreemap(container, fileRows) {
  const extMap = {};
  for (const f of fileRows) {
    const key = f.ext || '?';
    extMap[key] = (extMap[key] || 0) + 1;
  }
  const entries = Object.entries(extMap).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (entries.length === 0) { container.innerHTML = '<div class="chart-empty">No files found</div>'; return; }

  const total = entries.reduce((s, e) => s + e[1], 0);
  const langColors = {
    js: '#f7df1e', jsx: '#61dafb', ts: '#3178c6', tsx: '#3178c6', py: '#3572A5',
    java: '#b07219', go: '#00ADD8', rs: '#dea584', rb: '#701516', php: '#4F5D95',
    css: '#563d7c', scss: '#c6538c', html: '#e34c26', json: '#292929', xml: '#0060ac',
    yml: '#cb171e', yaml: '#cb171e', md: '#083fa1', sql: '#e38c00', sh: '#89e051',
    dockerfile: '#384d54', tf: '#5c4ee5', kt: '#7f52ff', swift: '#f05138',
  };

  const W = 600, H = 280;
  const svgEl = svg('svg', { width: '100%', height: H, viewBox: `0 0 ${W} ${H}` });

  // Simple squarified treemap: sort by size descending, layout in rows
  let x = 0, y = 0;
  const rowH = Math.floor(H / 3);

  entries.forEach(([ext, count], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const w = Math.floor((W / 3) - 4);
    const rx = col * (W / 3) + 2;
    const ry = row * rowH + 2;
    const rh = rowH - 4;
    const pct = Math.round((count / total) * 100);
    const color = langColors[ext] || getProjectColor(i);

    svgEl.appendChild(svg('rect', { x: rx, y: ry, width: w, height: rh, rx: '4', fill: color, opacity: '0.75' }));
    svgEl.appendChild(svg('text', { x: rx + 8, y: ry + 18, fill: '#fff', 'font-size': '13', 'font-weight': '700' }, `.${ext}`));
    svgEl.appendChild(svg('text', { x: rx + 8, y: ry + 34, fill: 'rgba(255,255,255,0.8)', 'font-size': '11' }, `${count} files`));
    svgEl.appendChild(svg('text', { x: rx + 8, y: ry + 50, fill: 'rgba(255,255,255,0.6)', 'font-size': '10' }, `${pct}%`));
  });

  container.innerHTML = '';
  container.appendChild(svgEl);
}

// ─── 2. Ownership Risk (Bus Factor) ──────────────────────
function renderBubbleChart(container, projects) {
  if (projects.length === 0) { container.innerHTML = '<div class="chart-empty">No project data</div>'; return; }
  const maxCount = Math.max(...projects.map(p => p.count), 1);
  const sorted = [...projects].sort((a, b) => a.count - b.count);

  // Risk tiers based on contributor count (bus factor proxy)
  const riskOf = (count) => count <= 2 ? 'high' : count <= 5 ? 'medium' : 'low';
  const riskColor = (r) => r === 'high' ? '#ef4444' : r === 'medium' ? '#f59e0b' : '#10b981';

  let html = `<div class="bf-grid">
    <div class="bf-row bf-header">
      <span class="bf-cell bf-repo">Repository</span>
      <span class="bf-cell bf-count">${projects[0]?.count !== undefined ? 'MRs' : 'Commits'}</span>
      <span class="bf-cell bf-risk">Risk</span>
      <span class="bf-cell bf-bar"></span>
    </div>`;

  for (const p of sorted) {
    const risk = riskOf(p.count);
    const color = riskColor(risk);
    const label = risk === 'high' ? '🔴 Concentrated' : risk === 'medium' ? '🟡 Shared' : '🟢 Distributed';
    const pct = Math.round((p.count / maxCount) * 100);
    html += `
      <div class="bf-row">
        <span class="bf-cell bf-repo" title="${escHtml(p.name)}">${escHtml(p.name)}</span>
        <span class="bf-cell bf-count">${p.count}</span>
        <span class="bf-cell bf-risk"><span class="bf-badge" style="background:${color}20;color:${color};border-color:${color}40">${label}</span></span>
        <span class="bf-cell bf-bar"><span class="bf-bar-fill" style="width:${pct}%;background:${color}"></span></span>
      </div>`;
  }

  html += `</div>
    <div class="bf-footer">
      <span>🔴 = 1-2 contributors (concentrated ownership)</span>
      <span>🟡 = 3-5 contributors</span>
      <span>🟢 = 6+ contributors (shared ownership)</span>
    </div>`;

  container.innerHTML = html;
}

// ─── 3. Activity Calendar ────────────────────────────────
function renderActivityCalendar(container, weeklyData, allProjNames) {
  const weeks = Object.keys(weeklyData).sort();
  if (weeks.length === 0) { container.innerHTML = '<div class="chart-empty">No activity data</div>'; return; }

  const cellSize = 12;
  const cellGap = 3;
  const labelW = 130;
  const rowH = cellSize + cellGap;
  const colW = cellSize + cellGap;
  const projList = allProjNames.slice(0, 15);
  const H = 30 + projList.length * rowH;
  const W = Math.max(400, labelW + weeks.length * colW + 20);

  const maxVal = Math.max(...Object.values(weeklyData).flatMap(w => Object.values(w)), 1);

  const svgEl = svg('svg', { width: '100%', height: H, viewBox: `0 0 ${W} ${H}` });

  // Column headers (week start dates)
  weeks.forEach((w, i) => {
    if (i % 4 === 0) {
      svgEl.appendChild(svg('text', { x: labelW + 2 + i * colW, y: 12, fill: 'var(--text-muted)', 'font-size': '8' }, w.slice(5)));
    }
  });

  projList.forEach((proj, ri) => {
    const y = 24 + ri * rowH;
    svgEl.appendChild(svg('text', { x: labelW - 4, y: y + cellSize - 2, 'text-anchor': 'end', fill: 'var(--text)', 'font-size': '9', 'font-weight': '500' },
      proj.length > 18 ? proj.slice(0, 16) + '…' : proj));

    weeks.forEach((w, ci) => {
      const val = weeklyData[w]?.[proj] || 0;
      const level = val === 0 ? 0 : val <= maxVal * 0.25 ? 1 : val <= maxVal * 0.5 ? 2 : val <= maxVal * 0.75 ? 3 : 4;
      const colors = ['var(--cal-empty)', 'var(--cal-level-1)', 'var(--cal-level-2)', 'var(--cal-level-3)', 'var(--cal-level-4)'];
      const x = labelW + ci * colW;
      svgEl.appendChild(svg('rect', { x, y, width: cellSize, height: cellSize, rx: '3', fill: colors[level], style: 'cursor:pointer' }));
    });
  });

  // Legend
  const lx = W - 140;
  const ly = H - 14;
  svgEl.appendChild(svg('text', { x: lx, y: ly, fill: 'var(--text-muted)', 'font-size': '8' }, 'Less'));
  [0, 1, 2, 3, 4].forEach(l => {
    const colors = ['var(--cal-empty)', 'var(--cal-level-1)', 'var(--cal-level-2)', 'var(--cal-level-3)', 'var(--cal-level-4)'];
    svgEl.appendChild(svg('rect', { x: lx + 30 + l * 16, y: ly - 10, width: 12, height: 12, rx: '2', fill: colors[l] }));
  });
  svgEl.appendChild(svg('text', { x: lx + 30 + 5 * 16 + 4, y: ly, fill: 'var(--text-muted)', 'font-size': '8' }, 'More'));

  container.innerHTML = '';
  container.appendChild(svgEl);
}

// ─── 4. Project Table ────────────────────────────────────
function renderProjectTable(container, projEntries, isMR, data) {
  if (projEntries.length === 0) { container.innerHTML = '<div class="chart-empty">No projects</div>'; return; }
  const s = isMR ? 'MRs' : 'Commits';
  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Project</th>
          <th>${s}</th>
          <th>Added</th>
          <th>Deleted</th>
          <th>Modified</th>
          <th>Net</th>
          <th>Actions</th>
        </tr></thead>
        <tbody id="projectTableBody"></tbody>
      </table>
    </div>
  `;
  $('projectTableBody').innerHTML = projEntries.map((p, i) => `
    <tr>
      <td style="font-weight:600">${escHtml(p.name)}</td>
      <td>${p.count}</td>
      <td class="text-added">+${fmt(p.added)}</td>
      <td class="text-deleted">-${fmt(p.deleted)}</td>
      <td>~${fmt(p.modified)}</td>
      <td style="font-weight:700">${fmt(p.added + p.modified - p.deleted)}</td>
      <td><button class="btn-explore" data-project="${escHtml(p.name)}">🔍 Explore</button></td>
    </tr>
  `).join('');

  // Explore button handler
  document.querySelectorAll('.btn-explore').forEach(btn => {
    btn.addEventListener('click', () => {
      const projName = btn.dataset.project;
      renderExplorer($('explorerBody'), projName, data);
      // Switch to explorer tab
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.querySelector('[data-tab="explorer"]').classList.add('active');
      $('tab-explorer').classList.add('active');
    });
  });
}

// ─── 5. Review Flow ──────────────────────────────────────
function renderReviewFlow(container, mrRows, projects) {
  if (mrRows.length === 0) { container.innerHTML = '<div class="chart-empty">No MR data for review flow</div>'; return; }

  // Build reviewer relations from MR data (simplified: author clustering)
  const authorMap = {};
  for (const mr of mrRows) {
    if (!authorMap[mr.author]) authorMap[mr.author] = { count: 0, projects: new Set() };
    authorMap[mr.author].count++;
    authorMap[mr.author].projects.add(mr.project_name);
  }

  const authors = Object.entries(authorMap);
  if (authors.length === 0) { container.innerHTML = '<div class="chart-empty">No author data</div>'; return; }

  const W = 600, H = 280;
  const svgEl = svg('svg', { width: '100%', height: H, viewBox: `0 0 ${W} ${H}` });

  const cx = W / 2, cy = H / 2;
  const radius = Math.min(W, H) / 2 - 40;
  const maxCount = Math.max(...authors.map(a => a[1].count), 1);

  // Draw connection lines between authors of same project
  for (let i = 0; i < authors.length; i++) {
    for (let j = i + 1; j < authors.length; j++) {
      const [nameA, dataA] = authors[i];
      const [nameB, dataB] = authors[j];
      const shared = [...dataA.projects].filter(p => dataB.projects.has(p)).length;
      if (shared > 0) {
        const angleA = (i / authors.length) * Math.PI * 2 - Math.PI / 2;
        const angleB = (j / authors.length) * Math.PI * 2 - Math.PI / 2;
        const x1 = cx + radius * Math.cos(angleA);
        const y1 = cy + radius * Math.sin(angleA);
        const x2 = cx + radius * Math.cos(angleB);
        const y2 = cy + radius * Math.sin(angleB);
        const opacity = 0.1 + (shared / 5) * 0.3;
        svgEl.appendChild(svg('line', { x1, y1, x2, y2, stroke: 'var(--primary)', 'stroke-width': Math.min(3, shared), opacity: Math.min(opacity, 0.5) }));
      }
    }
  }

  // Draw nodes
  authors.forEach(([name, data], i) => {
    const angle = (i / authors.length) * Math.PI * 2 - Math.PI / 2;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    const r = 6 + (data.count / maxCount) * 14;
    svgEl.appendChild(svg('circle', { cx: x, cy: y, r, fill: 'var(--primary)', opacity: '0.7', stroke: 'var(--card-bg)', 'stroke-width': '2' }));
    svgEl.appendChild(svg('text', { x, y: y + r + 12, 'text-anchor': 'middle', fill: 'var(--text)', 'font-size': '8', 'font-weight': '600' },
      name.length > 10 ? name.slice(0, 8) + '…' : name));
  });

  container.innerHTML = '';
  container.appendChild(svgEl);
}

// ─── 6. Explorer (Mindmap) ───────────────────────────────
function renderExplorer(container, projName, data) {
  const projFiles = data.fileRows.filter(f => f.project_name === projName);
  if (projFiles.length === 0) { container.innerHTML = `<div class="chart-empty">No file data for ${escHtml(projName)}</div>`; return; }

  // Build tree
  const tree = { name: projName, type: 'dir', children: [], totalAdded: 0, totalDeleted: 0, totalModified: 0 };
  const dirMap = { '': tree };

  for (const f of projFiles) {
    const parts = f.file.split('/');
    const fileName = parts.pop();
    let currentPath = '';
    for (const part of parts) {
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (!dirMap[currentPath]) {
        const node = { name: part, type: 'dir', children: [], totalAdded: 0, totalDeleted: 0, totalModified: 0, parentPath };
        dirMap[parentPath || ''].children.push(node);
        dirMap[currentPath] = node;
      }
    }
    const fileNode = { name: fileName, type: 'file', ext: f.ext, added: f.added, deleted: f.deleted, modified: f.modified, net: f.net, parentPath: currentPath };
    dirMap[currentPath || ''].children.push(fileNode);

    // Propagate totals up
    let p = currentPath;
    while (p !== undefined) {
      if (dirMap[p]) {
        dirMap[p].totalAdded += f.added;
        dirMap[p].totalDeleted += f.deleted;
        dirMap[p].totalModified += f.modified;
      }
      p = dirMap[p]?.parentPath;
      if (p === '') break;
    }
    tree.totalAdded += f.added;
    tree.totalDeleted += f.deleted;
    tree.totalModified += f.modified;
  }

  // Render collapsible tree
  let html = `<div class="mindmap-header">
    <strong>${escHtml(projName)}</strong>
    <span class="text-muted"> — ${projFiles.length} files, +${fmt(tree.totalAdded)} / -${fmt(tree.totalDeleted)} / ~${fmt(tree.totalModified)}</span>
  </div><div class="mindmap-tree">`;
  html += renderTreeNode(tree, data.type !== 'commit');
  html += '</div>';
  container.innerHTML = html;

  // Collapse/expand
  container.querySelectorAll('.mm-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const children = btn.parentElement.nextElementSibling;
      if (children) {
        children.style.display = children.style.display === 'none' ? '' : 'none';
        btn.textContent = children.style.display === 'none' ? '▶' : '▼';
      }
    });
  });
}

function renderTreeNode(node, showStats) {
  if (node.type === 'file') {
    const extBadge = node.ext ? `<span class="mm-ext">.${node.ext}</span>` : '';
    return `<div class="mm-node mm-file">
      <span class="mm-icon">📄</span>
      ${extBadge}
      <span class="mm-name">${escHtml(node.name)}</span>
      ${showStats ? `<span class="mm-stats">+${node.added}/-${node.deleted}/~${node.modified}</span>` : ''}
      <span class="mm-net ${node.net >= 0 ? 'text-added' : 'text-deleted'}">${node.net >= 0 ? '+' : ''}${node.net}</span>
    </div>`;
  }

  const hasChildren = node.children && node.children.length > 0;
  const icon = node.name === projNameFromPath() ? '📦' : '📁';
  const toggle = hasChildren ? '<span class="mm-toggle">▼</span>' : '<span class="mm-toggle-placeholder"></span>';

  let html = `<div class="mm-node mm-dir">
    ${toggle}
    <span class="mm-icon">${icon}</span>
    <span class="mm-name">${escHtml(node.name)}</span>
    ${showStats ? `<span class="mm-stats">+${fmt(node.totalAdded)}/-${fmt(node.totalDeleted)}/${fmt(node.totalModified)}</span>` : ''}
  </div>`;
  if (hasChildren) {
    html += '<div class="mm-children">';
    const dirs = node.children.filter(c => c.type === 'dir').sort((a, b) => b.totalAdded - a.totalAdded);
    const files = node.children.filter(c => c.type === 'file').sort((a, b) => b.net - a.net);
    for (const d of dirs) html += renderTreeNode(d, showStats);
    for (const f of files) html += renderTreeNode(f, showStats);
    html += '</div>';
  }
  return html;
}

let _exploreProjName = '';
function projNameFromPath() { return _exploreProjName; }

// Override renderExplorer to store the project name
const _origRenderExplorer = renderExplorer;
renderExplorer = function(container, projName, data) {
  _exploreProjName = projName;
  _origRenderExplorer(container, projName, data);
};
