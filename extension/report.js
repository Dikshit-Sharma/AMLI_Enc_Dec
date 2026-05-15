// ═══════════════════════════════════════════════════════════
//  RepoScope v2.0 — Full Dashboard + LOC Report
// ═══════════════════════════════════════════════════════════

// ─── State ──────────────────────────────────────────────
let abortController = null;
let cachedDash = null;      // dashboard data (broad fetch)
let cachedLOC = null;       // LOC report data
let dashDays = 90;          // current dashboard range
let currentTheme = 'light';
let locData = null;
let compareData = null;
let dashFilterProjects = [];    // selected project names
let dashFilterContributors = []; // selected contributor emails
let lastDashData = null;        // last rendered dashboard data (for 3D network)

// ─── DOM ─────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const show = id => { const el = $(id); if (el) el.style.display = ''; };
const hide = id => { const el = $(id); if (el) el.style.display = 'none'; };
const qs = (sel, ctx) => (ctx || document).querySelector(sel);
const qsa = (sel, ctx) => (ctx || document).querySelectorAll(sel);

// ─── Theme ───────────────────────────────────────────────
function toggleTheme() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);
  $('sThemeToggle').textContent = currentTheme === 'dark' ? '☀️' : '🌙';
  try { localStorage.setItem('reposcope_theme', currentTheme); } catch {}
}
$('sThemeToggle').addEventListener('click', toggleTheme);
try {
  const saved = localStorage.getItem('reposcope_theme');
  if (saved) { currentTheme = saved; document.documentElement.setAttribute('data-theme', currentTheme); $('sThemeToggle').textContent = currentTheme === 'dark' ? '☀️' : '🌙'; }
} catch {}

// ─── Helpers ─────────────────────────────────────────────
function escHtml(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmt(n) { return (n === undefined || n === null ? 0 : Number(n)).toLocaleString('en-IN'); }
function pct(a, b) { return b === 0 ? 0 : Math.round((a / b) * 100); }

const COLORS = ['#6366f1','#22d3ee','#f59e0b','#ef4444','#10b981','#ec4899','#8b5cf6','#14b8a6','#f97316','#06b6d4','#84cc16','#d946ef'];

function getColor(i) { return COLORS[i % COLORS.length]; }

function groupBy(arr, fn) {
  const m = {};
  for (const item of arr) { const k = fn(item); if (!m[k]) m[k] = []; m[k].push(item); }
  return m;
}

// ─── SVG utility ─────────────────────────────────────────
function svg(tag, attrs, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  for (const c of children) { if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
  return el;
}

// ─── Tooltip helpers ─────────────────────────────────────
let tooltipEl = null;
function initTooltip() {
  tooltipEl = document.getElementById('chartTooltip');
  if (!tooltipEl) { tooltipEl = document.createElement('div'); tooltipEl.id = 'chartTooltip'; tooltipEl.className = 'chart-tooltip'; tooltipEl.style.display = 'none'; document.body.appendChild(tooltipEl); }
}
function showTooltip(e, html) {
  if (!tooltipEl) initTooltip();
  tooltipEl.innerHTML = html;
  tooltipEl.style.display = 'block';
  const r = tooltipEl.getBoundingClientRect();
  let x = e.clientX + 12, y = e.clientY - r.height - 10;
  if (x + r.width > window.innerWidth - 10) x = e.clientX - r.width - 12;
  if (y < 10) y = e.clientY + 12;
  tooltipEl.style.left = x + 'px';
  tooltipEl.style.top = y + 'px';
}
function hideTooltip() {
  if (tooltipEl) tooltipEl.style.display = 'none';
}

// ─── Interactive overlay helper ──────────────────────────
function addHitTarget(svgEl, x, y, w, h, tooltipHtml) {
  const r = svg('rect', { x, y, width: w || 1, height: h || 1, fill: 'transparent', style: 'cursor:pointer' });
  r.addEventListener('mouseenter', e => showTooltip(e, tooltipHtml));
  r.addEventListener('mousemove', e => showTooltip(e, tooltipHtml));
  r.addEventListener('mouseleave', hideTooltip);
  svgEl.appendChild(r);
  return r;
}

// ─── Aggregation: filter raw commits by date range ──────
function aggregateCommits(allCommits, startDate, endDate) {
  const cutoffStart = startDate ? new Date(startDate) : null;
  const cutoffEnd = endDate ? new Date(endDate) : null;
  const filtered = cutoffStart || cutoffEnd
    ? allCommits.filter(c => {
        const d = new Date(c.created_at);
        if (cutoffStart && d < cutoffStart) return false;
        if (cutoffEnd && d > cutoffEnd) return false;
        return true;
      })
    : allCommits;

  const projectMap = {};
  const weeklyAgg = {};
  const contributorAgg = {};
  const projWeekly = {};

  for (const commit of filtered) {
    const projName = commit.project_name;
    const stats = commit.stats || { additions: 0, deletions: 0, total: 0 };

    if (!projectMap[projName]) projectMap[projName] = { name: projName, commits: 0, added: 0, deleted: 0 };
    projectMap[projName].commits++;
    projectMap[projName].added += stats.additions;
    projectMap[projName].deleted += stats.deletions;

    const wk = getWeekKey(new Date(commit.created_at));
    weeklyAgg[wk] = (weeklyAgg[wk] || 0) + 1;
    if (!projWeekly[projName]) projWeekly[projName] = {};
    projWeekly[projName][wk] = (projWeekly[projName][wk] || 0) + 1;

    const author = commit.author_email || commit.author_name || 'unknown';
    if (!contributorAgg[author]) contributorAgg[author] = { name: commit.author_name || author, weeks: {} };
    contributorAgg[author].weeks[wk] = (contributorAgg[author].weeks[wk] || 0) + 1;
  }

  return {
    projects: projectMap,
    totalCommits: filtered.length,
    totalProjects: Object.keys(projectMap).length,
    totalAdded: Object.values(projectMap).reduce((s, p) => s + p.added, 0),
    totalDeleted: Object.values(projectMap).reduce((s, p) => s + p.deleted, 0),
    weeklyAgg,
    contributorAgg: Object.fromEntries(Object.entries(contributorAgg).map(([k, v]) => [k, { name: v.name, weeks: v.weeks }])),
    projWeekly,
  };
}

// ─── Cached Results ──────────────────────────────────────
function getCacheKey(baseUrl) {
  return `rs_dash_full_${btoa(baseUrl)}`;
}

function loadCache(baseUrl) {
  try {
    const key = getCacheKey(baseUrl);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - data.ts < 5 * 60 * 1000) return data;
    return null;
  } catch { return null; }
}

function saveCache(baseUrl, data) {
  try {
    const key = getCacheKey(baseUrl);
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

// ─── Client-side filter: re-aggregate from cached raw data
function filterDash(days, filterProjects, filterContributors) {
  if (!cachedDash || !cachedDash.rawCommits) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  let commits = cachedDash.rawCommits;
  if (filterProjects && filterProjects.length > 0) {
    commits = commits.filter(c => filterProjects.includes(c.project_name));
  }
  if (filterContributors && filterContributors.length > 0) {
    commits = commits.filter(c => {
      const author = c.author_email || c.author_name || '';
      return filterContributors.some(f => author.includes(f) || f.includes(author));
    });
  }

  const agg = aggregateCommits(commits, cutoff, new Date());
  agg.dirChurn = cachedDash.dirChurn || [];
  agg.days = days;
  agg.user = cachedDash.user;
  agg.fetchedAt = cachedDash.fetchedAt;
  agg.filteredCommits = commits; // store filtered commits for 3D network
  renderDashboard(agg, { fromCache: true });
  return true;
}

// ─── Dashboard filter options ────────────────────────────
function buildFilterOptions() {
  if (!cachedDash || !cachedDash.rawCommits) return;
  const commits = cachedDash.rawCommits;
  const projSet = new Set();
  const authSet = new Set();
  for (const c of commits) {
    if (c.project_name) projSet.add(c.project_name);
    const author = c.author_email || c.author_name;
    if (author) authSet.add(author);
  }
  const projOptions = [...projSet].sort((a, b) => a.localeCompare(b));
  const authOptions = [...authSet].sort((a, b) => a.localeCompare(b));

  // Build project checkboxes
  const projMenu = $('filterProjectMenu');
  projMenu.innerHTML = projOptions.map(p =>
    `<label><input type="checkbox" value="${p.replace(/"/g, '&quot;')}" ${dashFilterProjects.includes(p) ? 'checked' : ''}> ${escHtml(p)}</label>`
  ).join('');

  // Build contributor checkboxes
  const contribMenu = $('filterContributorMenu');
  contribMenu.innerHTML = authOptions.map(a =>
    `<label><input type="checkbox" value="${a.replace(/"/g, '&quot;')}" ${dashFilterContributors.includes(a) ? 'checked' : ''}> ${escHtml(a)}</label>`
  ).join('');

  // Show filter bar if we have options
  $('dashFilterBar').style.display = projOptions.length > 1 || authOptions.length > 1 ? '' : 'none';
}

function renderFilterChips() {
  const container = $('filterChips');
  const chips = [];
  for (const p of dashFilterProjects) chips.push({ type: 'project', label: p });
  for (const c of dashFilterContributors) chips.push({ type: 'contributor', label: c });
  if (chips.length === 0) { container.innerHTML = ''; return; }
  container.innerHTML = chips.map((ch, i) =>
    `<span class="filter-chip">${escHtml(ch.label)}<button class="filter-chip-clear" data-fi="${i}" data-type="${ch.type}">✕</button></span>`
  ).join('');
  // Attach clear handlers
  container.querySelectorAll('.filter-chip-clear').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const label = chips[parseInt(btn.dataset.fi)].label;
      if (type === 'project') {
        dashFilterProjects = dashFilterProjects.filter(p => p !== label);
      } else {
        dashFilterContributors = dashFilterContributors.filter(c => c !== label);
      }
      refreshFilterCheckboxes();
      filterDash(dashDays, dashFilterProjects, dashFilterContributors);
    });
  });
}

function refreshFilterCheckboxes() {
  qsa('#filterProjectMenu input[type="checkbox"]').forEach(cb => {
    cb.checked = dashFilterProjects.includes(cb.value);
  });
  qsa('#filterContributorMenu input[type="checkbox"]').forEach(cb => {
    cb.checked = dashFilterContributors.includes(cb.value);
  });
}

// Dropdown toggle
document.addEventListener('click', e => {
  // Close all filter dropdowns when clicking outside
  if (!e.target.closest('.filter-dropdown')) {
    qsa('.filter-dropdown-menu').forEach(m => m.classList.remove('open'));
  }
});
$('filterProjectBtn').addEventListener('click', e => {
  e.stopPropagation();
  $('filterContributorMenu').classList.remove('open');
  $('filterProjectMenu').classList.toggle('open');
});
$('filterContributorBtn').addEventListener('click', e => {
  e.stopPropagation();
  $('filterProjectMenu').classList.remove('open');
  $('filterContributorMenu').classList.toggle('open');
});

// Filter checkbox change
$('filterProjectMenu').addEventListener('change', e => {
  if (e.target.type !== 'checkbox') return;
  if (e.target.checked) {
    if (!dashFilterProjects.includes(e.target.value)) dashFilterProjects.push(e.target.value);
  } else {
    dashFilterProjects = dashFilterProjects.filter(p => p !== e.target.value);
  }
  renderFilterChips();
  filterDash(dashDays, dashFilterProjects, dashFilterContributors);
});
$('filterContributorMenu').addEventListener('change', e => {
  if (e.target.type !== 'checkbox') return;
  if (e.target.checked) {
    if (!dashFilterContributors.includes(e.target.value)) dashFilterContributors.push(e.target.value);
  } else {
    dashFilterContributors = dashFilterContributors.filter(c => c !== e.target.value);
  }
  renderFilterChips();
  filterDash(dashDays, dashFilterProjects, dashFilterContributors);
});

// ─── GitLab API ──────────────────────────────────────────
async function apiFetch(baseUrl, endpoint, params, token, signal) {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`);
  if (params) Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') url.searchParams.set(k, v); });
  const res = await fetch(url, { headers: { 'PRIVATE-TOKEN': token }, signal });
  if (!res.ok) {
    let body; try { body = await res.text(); } catch { body = ''; }
    throw new Error(`GitLab API ${res.status}${body ? ': ' + body.slice(0, 200) : ''}`);
  }
  return res;
}

async function paginate(baseUrl, endpoint, params, token, signal) {
  const items = [];
  let page = 1;
  while (true) {
    if (signal && signal.aborted) throw new Error('Cancelled');
    const res = await apiFetch(baseUrl, endpoint, { ...params, page, per_page: 100 }, token, signal);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    items.push(...data);
    if (data.length < 100) break;
    page++;
  }
  return items;
}

// ─── Sidebar / Navigation ───────────────────────────────
qsa('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    qsa('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    hide('screenWelcome');
    hide('loadingBar');
    hide('viewDashboard');
    hide('viewLocReport');
    const viewId = `view${btn.dataset.view === 'dashboard' ? 'Dashboard' : 'LocReport'}`;
    const el = $(viewId);
    if (el) {
      el.style.display = '';
      // If loc report and no results yet, scroll form into view
      if (viewId === 'viewLocReport') {
        setTimeout(() => $('locFormSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      }
    } else {
      show('screenWelcome');
    }
  });
});

$('locBackToDashboard').addEventListener('click', () => {
  qs('[data-view="dashboard"]').click();
});

// ─── Token persistence ──────────────────────────────────
try {
  const saved = JSON.parse(localStorage.getItem('rs_config') || '{}');
  if (saved.baseUrl) $('sBaseUrl').value = saved.baseUrl;
  if (saved.token) $('sToken').value = saved.token;
} catch {}

function saveConfig() {
  try { localStorage.setItem('rs_config', JSON.stringify({ baseUrl: $('sBaseUrl').value, token: $('sToken').value })); } catch {}
}
$('sBaseUrl').addEventListener('input', saveConfig);
$('sToken').addEventListener('input', saveConfig);

// ─── Status bar ──────────────────────────────────────────
function setStatus(msg, isError) {
  const el = $('sStatus');
  el.textContent = msg;
  el.style.color = isError ? 'var(--error)' : 'var(--text-muted)';
}

// ─── Fetch Dashboard ─────────────────────────────────────
$('sFetchBtn').addEventListener('click', () => fetchDashboard(true));
$('presetBar').addEventListener('click', e => {
  const btn = e.target.closest('.preset-btn');
  if (!btn) return;
  // Close 3D network if active
  if (dash3dActive) hideDashboard3D();
  qsa('.preset-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  dashDays = parseInt(btn.dataset.days, 10);
  // Filter from cache instead of re-fetching
  if (!filterDash(dashDays, dashFilterProjects, dashFilterContributors)) {
    // No cache available — do a full fetch
    fetchDashboard();
  }
});

async function fetchDashboard(forceRefresh) {
  const baseUrl = $('sBaseUrl').value.trim();
  const token = $('sToken').value.trim();
  if (!baseUrl || !token) { setStatus('Enter URL and token', true); return; }
  saveConfig();

  // Try loading from cache first (skip if forced)
  if (!forceRefresh) {
    const cached = loadCache(baseUrl);
    if (cached && cached.data && cached.data.rawCommits) {
      cachedDash = cached.data;
      dashFilterProjects = [];
      dashFilterContributors = [];
      hide('screenWelcome');
      hide('loadingBar');
      filterDash(dashDays);
      setStatus(`Cached — ${new Date(cached.ts).toLocaleTimeString()}`);
      return;
    }
  }

  // Reset filters on fresh fetch
  dashFilterProjects = [];
  dashFilterContributors = [];
  if (dash3dActive) hideDashboard3D();
  lastDashData = null;

  abortController = new AbortController();
  const signal = abortController.signal;
  setStatus('Fetching...');

  hide('screenWelcome');
  show('loadingBar');
  const loadText = $('loadText');
  const loadBar = $('loadBar');

  try {
    // 1. Get current user
    setProgress(2, 'Authenticating...');
    const userRes = await apiFetch(baseUrl, '/user', {}, token, signal);
    const user = await userRes.json();
    if (!user || !user.id) throw new Error('Could not authenticate');
    const username = user.username;

    // 2. Fetch projects
    setProgress(8, 'Fetching projects...');
    const projects = await paginate(baseUrl, '/projects', { membership: true }, token, signal);
    if (projects.length === 0) throw new Error('No projects found');

    // 3. Fetch all commits for max range (365 days) — store raw for client-side filtering
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 365);
    const since = startDate.toISOString();
    const until = endDate.toISOString();

    const allCommits = [];
    const dirChurn = {};

    for (let i = 0; i < projects.length; i++) {
      if (signal.aborted) throw new Error('Cancelled');
      const proj = projects[i];
      const projName = proj.name || proj.path_with_namespace || `Project ${proj.id}`;
      const pct = 10 + Math.round((i / projects.length) * 80);
      setProgress(pct, `[${i + 1}/${projects.length}] ${projName}...`);

      const commits = await paginate(baseUrl, `/projects/${proj.id}/repository/commits`, {
        since, until, all: 'true', with_stats: 'true', per_page: 100,
      }, token, signal);

      for (const commit of commits) {
        if (signal.aborted) throw new Error('Cancelled');
        allCommits.push({ ...commit, project_name: projName, project_id: proj.id });

        // Churn: first 10 proj × 500 commits
        if (i < 10 && allCommits.length < 500) {
          try {
            const diffRes = await apiFetch(baseUrl, `/projects/${proj.id}/repository/commits/${commit.id}/diff`, {}, token, signal);
            const diffs = await diffRes.json();
            if (Array.isArray(diffs)) for (const d of diffs) {
              const fp = d.new_path || d.old_path || '';
              const dir = fp.includes('/') ? fp.split('/')[0] : '/';
              dirChurn[dir] = (dirChurn[dir] || 0) + 1;
            }
          } catch {}
        }
      }
    }

    // 4. Aggregate from all raw commits for current dashDays
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - dashDays);
    const agg = aggregateCommits(allCommits, cutoff, new Date());
    const data = {
      ...agg,
      user,
      dirChurn: Object.entries(dirChurn).sort((a, b) => b[1] - a[1]),
      days: dashDays,
      fetchedAt: new Date().toISOString(),
      rawCommits: allCommits,   // store for client-side re-filtering
      rawProjects: projects,
      filteredCommits: allCommits, // initial filtered = all
    };

    cachedDash = data;
    saveCache(baseUrl, data);

    setProgress(98, 'Rendering...');
    hide('loadingBar');
    renderDashboard(data);
    setStatus(`Ready — ${Object.keys(agg.projects).length} repos, ${agg.totalCommits} commits`);

  } catch (err) {
    hide('loadingBar');
    if (err.message === 'Cancelled') {
      setStatus('Cancelled');
    } else {
      setStatus(err.message, true);
      show('screenWelcome');
    }
  }
}

function setProgress(pct, text) {
  $('loadBar').style.width = pct + '%';
  $('loadText').textContent = text;
}

function getWeekKey(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d.setDate(diff));
  return mon.toISOString().slice(0, 10);
}

// ═══════════════════════════════════════════════════════════
//  DASHBOARD RENDER
// ═══════════════════════════════════════════════════════════

function renderDashboard(data, opts = {}) {
  const { projects, totalCommits, totalProjects, totalAdded, totalDeleted, weeklyAgg, contributorAgg, dirChurn, projWeekly } = data;
  const isMR = false; // dashboard uses commits

  $('dashSubtitle').textContent = `${totalProjects} repos · ${totalCommits} commits · +${fmt(totalAdded)} / -${fmt(totalDeleted)} lines · last ${dashDays} days`;

  // Summary cards
  $('dashSummary').innerHTML = `
    <div class="summary-card sc-added"><div class="sc-value">${fmt(totalAdded)}</div><div class="sc-label">Lines Added</div></div>
    <div class="summary-card sc-deleted"><div class="sc-value">${fmt(totalDeleted)}</div><div class="sc-label">Lines Deleted</div></div>
    <div class="summary-card sc-net"><div class="sc-value">${fmt(totalAdded - totalDeleted)}</div><div class="sc-label">Net LOC</div></div>
    <div class="summary-card sc-items"><div class="sc-value">${fmt(totalCommits)}</div><div class="sc-label">Commits</div></div>
    <div class="summary-card sc-projects"><div class="sc-value">${fmt(totalProjects)}</div><div class="sc-label">Repositories</div></div>
  `;

  // 1. Team Velocity Trend
  renderVelocityTrend($('velocityTrend'), weeklyAgg);

  // 2. Contributor Activity Timeline (stacked area)
  renderContributorTimeline($('contributorTimeline'), contributorAgg);

  // 3. Code Churn by Directory
  renderCodeChurn($('codeChurn'), dirChurn);

  // 4. Top Active Repos
  const projList = Object.values(projects).sort((a, b) => b.commits - a.commits);
  renderBarChart($('topRepos'), projList.slice(0, 10), { valueKey: 'commits', labelKey: 'name', height: Math.max(200, Math.min(projList.length, 10) * 32) });

  // 5. Project Sparklines
  renderSparklines($('sparklines'), projWeekly, Object.keys(projects));

  // Save for 3D network
  lastDashData = data;

  // Build filter options and chips
  buildFilterOptions();
  renderFilterChips();

  // Show dashboard (skip nav activation when filtering from cache — already on dashboard)
  hide('screenWelcome');
  hide('loadingBar');
  if (!opts.fromCache) {
    qsa('.nav-btn').forEach(b => b.classList.remove('active'));
    const dashBtn = qs('[data-view="dashboard"]');
    if (dashBtn) dashBtn.classList.add('active');
    hide('viewLocReport');
    show('viewDashboard');
  }
}

// ─── 1. Velocity Trend ──────────────────────────────────
function renderVelocityTrend(container, weeklyAgg) {
  const weeks = Object.keys(weeklyAgg).sort();
  if (weeks.length === 0) { container.innerHTML = '<div class="chart-empty">Not enough data</div>'; return; }

  const M = { top: 16, right: 12, bottom: 28, left: 36 };
  const W = 600, H = 200;
  const cw = W - M.left - M.right;
  const ch = H - M.top - M.bottom;
  const values = weeks.map(w => weeklyAgg[w]);
  const max = Math.max(...values, 1);
  const xS = i => M.left + (weeks.length > 1 ? (i / (weeks.length - 1)) * cw : cw / 2);
  const yS = v => M.top + ch - (v / max) * ch;
  const baseY = M.top + ch;

  const pts = values.map((v, i) => `${xS(i)},${yS(v)}`).join(' L');
  const area = `M${xS(0)},${baseY} L${pts} L${xS(weeks.length - 1)},${baseY} Z`;

  const svgEl = svg('svg', { width: '100%', height: H, viewBox: `0 0 ${W} ${H}` });
  svgEl.appendChild(svg('defs', {}, svg('linearGradient', { id: 'vGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
    svg('stop', { offset: '0%', 'stop-color': 'var(--primary)', 'stop-opacity': '0.25' }),
    svg('stop', { offset: '100%', 'stop-color': 'var(--primary)', 'stop-opacity': '0.02' })
  )));

  // Grid
  for (let i = 0; i < 4; i++) {
    const y = M.top + (ch / 3) * i;
    svgEl.appendChild(svg('line', { x1: M.left, y1: y, x2: W - M.right, y2: y, stroke: 'var(--border)', 'stroke-width': '1', 'stroke-dasharray': '4 4' }));
    svgEl.appendChild(svg('text', { x: M.left - 5, y: y + 3, 'text-anchor': 'end', fill: 'var(--text-muted)', 'font-size': '9' }, String(Math.round(max - (max / 3) * i))));
  }

  if (weeks.length > 1) {
    svgEl.appendChild(svg('path', { d: area, fill: 'url(#vGrad)' }));
    svgEl.appendChild(svg('path', { d: `M${pts}`, fill: 'none', stroke: 'var(--primary)', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }

  // X labels
  weeks.forEach((w, i) => {
    if (i % Math.max(1, Math.floor(weeks.length / 6)) === 0 || i === weeks.length - 1) {
      svgEl.appendChild(svg('text', { x: xS(i), y: H - 4, 'text-anchor': 'middle', fill: 'var(--text-muted)', 'font-size': '8' }, w.slice(5)));
    }
  });

  // Interactive overlays on each data point
  values.forEach((v, i) => {
    const cx = xS(i), cy = yS(v);
    const tip = `<div class="tt-header">${weeks[i]}</div><div class="tt-row"><span>Commits</span><strong>${v}</strong></div>`;
    const dot = svg('circle', { cx, cy, r: '4', fill: 'var(--primary)', opacity: '0', style: 'cursor:pointer;transition:opacity 0.15s' });
    dot.addEventListener('mouseenter', () => { dot.setAttribute('opacity', '1'); showTooltip(event, tip); });
    dot.addEventListener('mousemove', e => showTooltip(e, tip));
    dot.addEventListener('mouseleave', () => { dot.setAttribute('opacity', '0'); hideTooltip(); });
    svgEl.appendChild(dot);
    // Also add transparent wide hit target
    const prevX = i > 0 ? xS(i - 1) : cx - 15;
    const nextX = i < weeks.length - 1 ? xS(i + 1) : cx + 15;
    const hit = svg('rect', { x: (prevX + cx) / 2, y: M.top, width: (nextX - prevX) / 2, height: ch, fill: 'transparent', style: 'cursor:pointer' });
    hit.addEventListener('mouseenter', e => { dot.setAttribute('opacity', '1'); showTooltip(e, tip); });
    hit.addEventListener('mousemove', e => showTooltip(e, tip));
    hit.addEventListener('mouseleave', () => { dot.setAttribute('opacity', '0'); hideTooltip(); });
    svgEl.appendChild(hit);
  });

  container.innerHTML = '';
  container.appendChild(svgEl);
}

// ─── 2. Contributor Timeline (stacked area) ─────────────
function renderContributorTimeline(container, contributorAgg) {
  const contribs = Object.values(contributorAgg);
  if (contribs.length === 0) { container.innerHTML = '<div class="chart-empty">No contributor data</div>'; return; }

  // Collect all weeks
  const allWeeks = new Set();
  for (const c of contribs) for (const w of Object.keys(c.weeks)) allWeeks.add(w);
  const weeks = [...allWeeks].sort();
  if (weeks.length === 0) { container.innerHTML = '<div class="chart-empty">Not enough data</div>'; return; }

  // Top 5 contributors
  const top = contribs.sort((a, b) => Object.values(b.weeks).reduce((s, v) => s + v, 0) - Object.values(a.weeks).reduce((s, v) => s + v, 0)).slice(0, 5);
  const M = { top: 16, right: 12, bottom: 28, left: 8 };
  const W = 600, H = 200;
  const cw = W - M.left - M.right;
  const ch = H - M.top - M.bottom;
  const xS = i => M.left + (weeks.length > 1 ? (i / (weeks.length - 1)) * cw : cw / 2);

  // Compute stacked values
  const stacked = weeks.map((w, i) => {
    let sum = 0;
    const segs = [];
    for (const c of top) {
      const val = c.weeks[w] || 0;
      segs.push({ name: c.name, val, y0: sum, y1: sum + val });
      sum += val;
    }
    return { week: w, x: xS(i), total: sum, segs };
  });

  const maxTotal = Math.max(...stacked.map(s => s.total), 1);
  const yS = v => M.top + ch - (v / maxTotal) * ch;

  const svgEl = svg('svg', { width: '100%', height: H, viewBox: `0 0 ${W} ${H}` });

  // Draw stacked areas (with interactive overlays per contributor)
  for (let ci = top.length - 1; ci >= 0; ci--) {
    let path = '';
    const pts = [];
    for (let i = 0; i < stacked.length; i++) {
      const s = stacked[i];
      const seg = s.segs[ci];
      if (!seg) continue;
      const yBot = yS(seg.y0);
      const yTop = yS(seg.y1);
      pts.push({ x: s.x, yBot, yTop, week: s.week, val: seg.val });
      if (i === 0) path += `M${s.x},${yBot} L${s.x},${yTop}`;
      else path += ` L${s.x},${yTop}`;
    }
    for (let i = stacked.length - 1; i >= 0; i--) {
      const s = stacked[i];
      const seg = s.segs[ci];
      if (!seg) continue;
      path += ` L${s.x},${yS(seg.y0)}`;
    }
    path += ' Z';
    const areaPath = svg('path', { d: path, fill: getColor(ci), opacity: '0.7' });
    svgEl.appendChild(areaPath);

    // Add interactive hit targets per contributor segment
    if (pts.length === 0) continue;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const prevI = Math.max(0, i - 1);
      const nextI = Math.min(pts.length - 1, i + 1);
      const hx = (pts[prevI].x + p.x) / 2;
      const hw = (pts[nextI].x - pts[prevI].x) / 2;
      const tip = `<div class="tt-header">${p.week}</div><div class="tt-row"><span style="color:${getColor(ci)}">● ${top[ci].name}</span><strong>${p.val} commits</strong></div>`;
      const hit = svg('rect', { x: hx, y: p.yTop, width: Math.max(hw, 4), height: p.yBot - p.yTop, fill: 'transparent', style: 'cursor:pointer' });
      hit.addEventListener('mouseenter', e => { areaPath.setAttribute('opacity', '1'); showTooltip(e, tip); });
      hit.addEventListener('mousemove', e => showTooltip(e, tip));
      hit.addEventListener('mouseleave', () => { areaPath.setAttribute('opacity', '0.7'); hideTooltip(); });
      svgEl.appendChild(hit);
    }
  }

  // Legend
  top.forEach((c, i) => {
    const lx = 8 + (i % 3) * 195;
    const ly = H - 4 - Math.floor(i / 3) * 16;
    svgEl.appendChild(svg('rect', { x: lx, y: ly - 8, width: '8', height: '8', rx: '2', fill: getColor(i), opacity: '0.7' }));
    svgEl.appendChild(svg('text', { x: lx + 12, y: ly, fill: 'var(--text-muted)', 'font-size': '8' }, c.name.length > 14 ? c.name.slice(0, 12) + '…' : c.name));
  });

  container.innerHTML = '';
  container.appendChild(svgEl);
}

// ─── 3. Code Churn by Directory ─────────────────────────
function renderCodeChurn(container, dirChurn) {
  const entries = (dirChurn || []).slice(0, 12);
  if (entries.length === 0) { container.innerHTML = '<div class="chart-empty">Fetch more data or enable broader scan</div>'; return; }
  const max = entries[0][1];
  const svgEl = svg('svg', { width: '100%', height: Math.max(180, entries.length * 26 + 20) });
  entries.forEach(([dir, count], i) => {
    const y = 10 + i * 24;
    const w = (count / max) * 250;
    svgEl.appendChild(svg('text', { x: '4', y: y + 12, fill: 'var(--text)', 'font-size': '11', 'font-weight': '600' }, dir.length > 20 ? dir.slice(0, 18) + '…' : dir));
    const bar = svg('rect', { x: '140', y, width: Math.max(w, 2), height: '18', rx: '3', fill: getColor(i), opacity: '0.6', style: 'cursor:pointer;transition:opacity 0.15s' });
    const tip = `<div class="tt-header">${escHtml(dir)}</div><div class="tt-row"><span>Files changed</span><strong>${count}</strong></div>`;
    bar.addEventListener('mouseenter', e => { bar.setAttribute('opacity', '0.9'); showTooltip(e, tip); });
    bar.addEventListener('mousemove', e => showTooltip(e, tip));
    bar.addEventListener('mouseleave', () => { bar.setAttribute('opacity', '0.6'); hideTooltip(); });
    svgEl.appendChild(bar);
    svgEl.appendChild(svg('text', { x: '148', y: y + 13, fill: '#fff', 'font-size': '10', 'font-weight': '700' }, String(count)));
  });
  container.innerHTML = '';
  container.appendChild(svgEl);
}

// ─── 4. Bar Chart ───────────────────────────────────────
function renderBarChart(container, data, { valueKey, labelKey, height = 200, color } = {}) {
  if (!data || data.length === 0) { container.innerHTML = '<div class="chart-empty">No data</div>'; return; }
  const max = Math.max(...data.map(d => d[valueKey]), 1);
  const barH = Math.min(26, (height - 20) / data.length);
  const pad = 6;
  const labelW = 130;
  const svgEl = svg('svg', { width: '100%', height: Math.max(height, data.length * (barH + pad) + 20) });
  data.forEach((d, i) => {
    const y = 10 + i * (barH + pad);
    const w = (d[valueKey] / max) * (400 - labelW);
    svgEl.appendChild(svg('text', { x: labelW - 6, y: y + barH - 4, 'text-anchor': 'end', fill: 'var(--text)', 'font-size': '10', 'font-weight': '600' },
      d[labelKey].length > 16 ? d[labelKey].slice(0, 14) + '…' : d[labelKey]));
    const bar = svg('rect', { x: labelW, y, width: Math.max(w, 2), height: barH, rx: '3', fill: color || getColor(i), opacity: '0.65', style: 'cursor:pointer;transition:opacity 0.15s' });
    const tip = `<div class="tt-header">${escHtml(d[labelKey])}</div><div class="tt-row"><span>${valueKey}</span><strong>${d[valueKey]}</strong></div>`;
    bar.addEventListener('mouseenter', e => { bar.setAttribute('opacity', '0.9'); showTooltip(e, tip); });
    bar.addEventListener('mousemove', e => showTooltip(e, tip));
    bar.addEventListener('mouseleave', () => { bar.setAttribute('opacity', '0.65'); hideTooltip(); });
    svgEl.appendChild(bar);
    svgEl.appendChild(svg('text', { x: labelW + Math.max(w, 2) + 5, y: y + barH - 4, fill: 'var(--text-muted)', 'font-size': '9', 'font-weight': '700' }, String(d[valueKey])));
  });
  container.innerHTML = '';
  container.appendChild(svgEl);
}

// ─── 5. Project Sparklines ──────────────────────────────
function renderSparklines(container, projWeekly, projNames) {
  const names = projNames.slice(0, 20);
  if (names.length === 0) { container.innerHTML = '<div class="chart-empty">No data</div>'; return; }

  // Collect all weeks
  const allWeeks = new Set();
  for (const n of names) for (const w of Object.keys(projWeekly[n] || {})) allWeeks.add(w);
  const weeks = [...allWeeks].sort();
  if (weeks.length < 2) { container.innerHTML = '<div class="chart-empty">Need at least 2 weeks of data</div>'; return; }

  const sw = 100, sh = 24;
  const maxVal = Math.max(...names.map(n => Math.max(...Object.values(projWeekly[n] || {}), 1)), 1);

  let html = '<div class="spark-grid">';
  for (const name of names) {
    const vals = weeks.map(w => projWeekly[name]?.[w] || 0);
    const maxV = Math.max(...vals, 1);
    const pts = vals.map((v, i) => `${(i / (weeks.length - 1)) * sw},${sh - (v / maxV) * (sh - 4) - 2}`).join(' ');
    const total = vals.reduce((s, v) => s + v, 0);
    const weekDetails = weeks.map((w, i) => `<div class="tt-row"><span>${w.slice(5)}</span><strong>${vals[i]}</strong></div>`).join('');
    const tipId = `spk_${name.replace(/[^a-z0-9]/gi, '_')}`;
    html += `
      <div class="spark-item" id="${tipId}">
        <div class="spark-label" title="${escHtml(name)}">${escHtml(name.length > 18 ? name.slice(0, 16) + '…' : name)}</div>
        <div class="spark-svg-wrap">
          <svg width="${sw}" height="${sh}" viewBox="0 0 ${sw} ${sh}">
            <polyline points="${pts}" fill="none" stroke="var(--primary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="spark-count">${total}</div>
      </div>`;
  }
  container.innerHTML = html;
  // Attach hover events to spark items
  names.forEach((name, ni) => {
    const vals = weeks.map(w => projWeekly[name]?.[w] || 0);
    const total = vals.reduce((s, v) => s + v, 0);
    const weekDetails = weeks.map((w, i) => `<div class="tt-row"><span>${w.slice(5)}</span><strong>${vals[i]}</strong></div>`).join('');
    const tip = `<div class="tt-header">${escHtml(name)}</div><div class="tt-row"><span>Total</span><strong>${total}</strong></div>${weekDetails}`;
    const id = `spk_${name.replace(/[^a-z0-9]/gi, '_')}`;
    const item = document.getElementById(id);
    if (item) {
      item.addEventListener('mouseenter', e => showTooltip(e, tip));
      item.addEventListener('mousemove', e => showTooltip(e, tip));
      item.addEventListener('mouseleave', hideTooltip);
    }
  });
}

// ═══════════════════════════════════════════════════════════
//  LOC REPORT (existing functionality)
// ═══════════════════════════════════════════════════════════

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
      if (i + 1 < lines.length && lines[i + 1].startsWith('+') && !lines[i + 1].startsWith('+++')) { modified++; i++; continue; }
      deletions++;
    } else if (line.startsWith('+') && !line.startsWith('+++')) { additions++; }
  }
  return { additions, deletions, modified };
}

function parseFileChanges(changes) {
  const results = [];
  for (const change of (changes || [])) {
    const filePath = change.new_path || change.old_path || 'UNKNOWN';
    const { additions, deletions, modified } = countDiff(change.diff || '');
    const ext = filePath.includes('.') ? filePath.split('.').pop().toLowerCase() : '?';
    const dir = filePath.includes('/') ? filePath.split('/')[0] : '/';
    results.push({ file: filePath, ext, dir, added: additions, deleted: deletions, modified, net: additions + modified - deletions });
  }
  return results;
}

// ─── LOC Report — get form values ──────────────────────
function getLocForm() {
  return {
    reportType: $('locReportType').value,
    userId: $('locUserId').value.trim(),
    commitAuthor: $('locCommitAuthor').value.trim(),
    startDate: $('locStartDate').value,
    endDate: $('locEndDate').value,
  };
}

// ─── LOC presets from dashboard ─────────────────────────
function applyDashDates() {
  const end = new Date();
  const start = new Date(); start.setDate(start.getDate() - dashDays);
  $('locStartDate').value = start.toISOString().slice(0, 10);
  $('locEndDate').value = end.toISOString().slice(0, 10);
}

// ─── LOC Report type toggle ─────────────────────────────
$('locReportType').addEventListener('change', () => {
  $('locCommitAuthorRow').style.display = $('locReportType').value === 'commit' ? '' : 'none';
});

// ─── LOC Fetch ──────────────────────────────────────────
$('locFetchBtn').addEventListener('click', startLOCReport);
$('locCancelBtn').addEventListener('click', () => {
  if (abortController) { abortController.abort(); abortController = null; }
});

// ─── LOC Tab navigation ─────────────────────────────────
$('locTabBar').addEventListener('click', e => {
  const btn = e.target.closest('.tab-btn');
  if (!btn || !btn.dataset.locTab) return;
  qsa('.tab-btn', $('locTabBar')).forEach(b => b.classList.remove('active'));
  qsa('.loc-tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  const tabId = btn.dataset.locTab;
  const panelId = { overview: 'locTabOverview', calendar: 'locTabCalendar', projects: 'locTabProjects', contributors: 'locTabContributors', explorer: 'locTabExplorer' }[tabId];
  if (panelId) $(panelId).classList.add('active');
});

async function startLOCReport() {
  const baseUrl = $('sBaseUrl').value.trim();
  const token = $('sToken').value.trim();
  const { reportType, userId, commitAuthor, startDate, endDate } = getLocForm();

  if (!baseUrl || !token) { alert('Enter GitLab URL and token in the sidebar first.'); return; }
  if (!startDate || !endDate) { alert('Start and end dates required.'); return; }
  if (endDate < startDate) { alert('End date must be >= start date.'); return; }
  if (reportType === 'commit' && !commitAuthor) { alert('Commit Author is required for BY COMMIT mode.'); return; }

  abortController = new AbortController();
  const signal = abortController.signal;

  hide('locErrorSection');
  hide('locResultsSection');
  show('locProgressSection');
  $('locFetchBtn').disabled = true;
  $('locCancelBtn').style.display = '';

  try {
    let user;
    setProgressLOC(3, 'Looking up user...');
    if (userId && /^\d+$/.test(userId)) {
      // User ID provided — fetch directly
      const uRes = await apiFetch(baseUrl, `/users/${userId}`, {}, token, signal);
      user = await uRes.json();
      if (!user || !user.id) throw new Error(`User not found for ID: ${userId}`);
    } else if (userId) {
      // Username provided — search
      const uRes = await apiFetch(baseUrl, '/users', { search: userId }, token, signal);
      const users = await uRes.json();
      if (!Array.isArray(users) || users.length === 0) throw new Error(`User not found: ${userId}`);
      user = users[0];
    } else {
      // No user specified — use current authenticated user
      const uRes = await apiFetch(baseUrl, '/user', {}, token, signal);
      user = await uRes.json();
      if (!user || !user.id) throw new Error('Could not determine current user');
    }
    setProgressLOC(5, `Using user: ${user.name} (${user.username || user.id})`);

    setProgressLOC(8, 'Fetching projects...');
    const projects = await paginate(baseUrl, '/projects', { membership: true }, token, signal);
    if (projects.length === 0) throw new Error('No membership projects found.');

    const data = reportType === 'mr'
      ? await generateMRReport(baseUrl, token, user, projects, startDate, endDate, signal)
      : await generateCommitReport(baseUrl, token, user, projects, startDate, endDate, signal);

    locData = data;

    setProgressLOC(97, 'Rendering...');
    hide('locProgressSection');
    show('locResultsSection');
    renderLOCResults(data, reportType);

    // Show comparison section
    setupComparison(data, reportType);

  } catch (err) {
    if (err.message === 'Cancelled') {
      setProgressLOC(0, 'Cancelled.'); setTimeout(() => hide('locProgressSection'), 1500);
    } else {
      hide('locProgressSection');
      $('locErrorSection').style.display = ''; $('locErrorSection').innerHTML = `<div class="error-banner">${escHtml(err.message)}</div>`;
    }
  } finally {
    $('locFetchBtn').disabled = false;
    $('locCancelBtn').style.display = 'none';
    abortController = null;
  }
}

function setProgressLOC(pct, text) {
  $('locProgressBar').style.width = pct + '%';
  $('locProgressText').textContent = text;
}

// ─── MR Report ──────────────────────────────────────────
async function generateMRReport(baseUrl, token, user, projects, startDate, endDate, signal) {
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T23:59:59Z');
  const userId = user.id;
  const mrRows = [], fileRows = [], projectMap = {}, weeklyData = {}, contributorData = {};
  let grandAdded = 0, grandDeleted = 0, grandModified = 0, scanned = 0;

  for (const proj of projects) {
    if (signal.aborted) throw new Error('Cancelled');
    const pct = 10 + Math.round((scanned / projects.length) * 80);
    const projName = proj.name || proj.path_with_namespace || `Project ${proj.id}`;
    setProgressLOC(pct, `[${scanned + 1}/${projects.length}] ${projName}...`);

    const mrs = await paginate(baseUrl, `/projects/${proj.id}/merge_requests`, { author_id: userId, state: 'merged', per_page: 100 }, token, signal);
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

      for (const fs of fileStats) projFileTypes[fs.ext] = (projFileTypes[fs.ext] || 0) + 1;
      grandAdded += mrAdded; grandDeleted += mrDeleted; grandModified += mrModified;
      pAdded += mrAdded; pDeleted += mrDeleted; pModified += mrModified; pMRs++;

      const weekKey = getWeekKey(mergedDate);
      if (!weeklyData[weekKey]) weeklyData[weekKey] = {};
      if (!weeklyData[weekKey][projName]) weeklyData[weekKey][projName] = 0;
      weeklyData[weekKey][projName]++;

      if (mr.author?.username) {
        if (!contributorData[mr.author.username]) contributorData[mr.author.username] = { name: mr.author.name || mr.author.username, added: 0, deleted: 0, projects: new Set(), mrCount: 0 };
        contributorData[mr.author.username].added += mrAdded;
        contributorData[mr.author.username].deleted += mrDeleted;
        contributorData[mr.author.username].projects.add(projName);
        contributorData[mr.author.username].mrCount++;
      }

      mrRows.push({ project_name: projName, project_id: proj.id, mr_iid: mr.iid, mr_title: mr.title || '', merged_at: mr.merged_at, added: mrAdded, deleted: mrDeleted, modified: mrModified, net_loc: mrAdded + mrModified - mrDeleted, author: mr.author?.username || 'unknown' });
      for (const fs of fileStats) fileRows.push({ project_name: projName, project_id: proj.id, id: mr.iid, idLabel: `!${mr.iid}`, ...fs });
    }
    if (pMRs > 0) projectMap[proj.id] = { name: projName, count: pMRs, added: pAdded, deleted: pDeleted, modified: pModified, fileTypes: Object.entries(projFileTypes).sort((a, b) => b[1] - a[1]) };
    scanned++;
  }

  const allProjNames = [...new Set(Object.values(weeklyData).flatMap(w => Object.keys(w)))];
  return {
    type: 'mr',
    totals: { total_added: grandAdded, total_deleted: grandDeleted, total_modified: grandModified, total_net: grandAdded + grandModified - grandDeleted, total_items: mrRows.length, total_projects: Object.keys(projectMap).length },
    detailRows: mrRows, fileRows, projectMap, weeklyData, allProjNames,
    contributorData: Object.fromEntries(Object.entries(contributorData).map(([k, v]) => [k, { ...v, projects: [...v.projects] }])),
  };
}

// ─── Commit Report ──────────────────────────────────────
async function generateCommitReport(baseUrl, token, user, projects, startDate, endDate, signal) {
  const commitAuthor = $('locCommitAuthor').value.trim();
  const since = startDate + 'T00:00:00Z';
  const until = endDate + 'T23:59:59Z';
  const commitRows = [], fileRows = [], projectMap = {}, weeklyData = {}, contributorData = {};
  let grandAdded = 0, grandDeleted = 0, scanned = 0;

  for (const proj of projects) {
    if (signal.aborted) throw new Error('Cancelled');
    const pct = 10 + Math.round((scanned / projects.length) * 80);
    const projName = proj.name || proj.path_with_namespace || `Project ${proj.id}`;
    setProgressLOC(pct, `[${scanned + 1}/${projects.length}] ${projName}...`);
    const commits = await paginate(baseUrl, `/projects/${proj.id}/repository/commits`, { author: commitAuthor, since, until, all: 'true', with_stats: 'true' }, token, signal);
    let pAdded = 0, pDeleted = 0, pCommits = 0;

    for (const commit of commits) {
      if (signal.aborted) throw new Error('Cancelled');
      const stats = commit.stats || { additions: 0, deletions: 0, total: 0 };
      grandAdded += stats.additions; grandDeleted += stats.deletions;
      pAdded += stats.additions; pDeleted += stats.deletions; pCommits++;
      const shortId = commit.short_id || (commit.id ? commit.id.slice(0, 8) : '??');
      const d = new Date(commit.created_at); const weekKey = getWeekKey(d);
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

      commitRows.push({ project_name: projName, project_id: proj.id, commit_id: commit.id, commit_short: shortId, commit_title: commit.title || '', committed_at: commit.created_at || '', additions: stats.additions, deletions: stats.deletions, total: stats.total });
      try {
        const diffRes = await apiFetch(baseUrl, `/projects/${proj.id}/repository/commits/${commit.id}/diff`, {}, token, signal);
        const diffs = await diffRes.json();
        if (Array.isArray(diffs)) for (const diff of diffs) {
          const { additions: fa, deletions: fd, modified: fm } = countDiff(diff.diff || '');
          const fp = diff.new_path || diff.old_path || 'UNKNOWN';
          const ext = fp.includes('.') ? fp.split('.').pop().toLowerCase() : '?';
          const dir = fp.includes('/') ? fp.split('/')[0] : '/';
          fileRows.push({ project_name: projName, project_id: proj.id, id: shortId, idLabel: shortId, file: fp, ext, dir, added: fa, deleted: fd, modified: fm, net: fa + fm - fd });
        }
      } catch {}
    }
    if (pCommits > 0) projectMap[proj.id] = { name: projName, count: pCommits, added: pAdded, deleted: pDeleted, modified: 0, fileTypes: [] };
    scanned++;
  }
  const allProjNames = [...new Set(Object.values(weeklyData).flatMap(w => Object.keys(w)))];
  return {
    type: 'commit',
    totals: { total_added: grandAdded, total_deleted: grandDeleted, total_modified: 0, total_net: grandAdded - grandDeleted, total_items: commitRows.length, total_projects: Object.keys(projectMap).length },
    detailRows: commitRows, fileRows, projectMap, weeklyData, allProjNames,
    contributorData: Object.fromEntries(Object.entries(contributorData).map(([k, v]) => [k, { ...v, projects: [...v.projects] }])),
  };
}

// ═══════════════════════════════════════════════════════════
//  LOC RENDER (reuses dashboard chart functions)
// ═══════════════════════════════════════════════════════════

function renderLOCResults(data, reportType) {
  const { totals, projectMap, fileRows, detailRows, weeklyData, allProjNames, contributorData } = data;
  const isMR = reportType === 'mr';

  $('locSummaryGrid').innerHTML = `
    <div class="summary-card sc-added"><div class="sc-value">${fmt(totals.total_added)}</div><div class="sc-label">Lines Added</div></div>
    <div class="summary-card sc-deleted"><div class="sc-value">${fmt(totals.total_deleted)}</div><div class="sc-label">Lines Deleted</div></div>
    <div class="summary-card sc-net"><div class="sc-value">${fmt(totals.total_net)}</div><div class="sc-label">Net LOC</div></div>
    <div class="summary-card sc-items"><div class="sc-value">${fmt(totals.total_items)}</div><div class="sc-label">${isMR ? 'MRs' : 'Commits'}</div></div>
    <div class="summary-card sc-projects"><div class="sc-value">${fmt(totals.total_projects)}</div><div class="sc-label">Projects</div></div>
  `;

  // Overview tab
  renderTreemap($('locTreemap'), fileRows);
  renderOwnership($('locOwnership'), Object.values(projectMap));
  const projEntries = Object.values(projectMap).sort((a, b) => b.count - a.count);
  renderBarChart($('locProjectBars'), projEntries.slice(0, 12), { valueKey: 'count', labelKey: 'name', height: Math.max(200, projEntries.length * 30) });

  // Calendar tab
  renderLOCActivityCalendar($('locCalendar'), weeklyData, allProjNames);

  // Projects tab
  renderLOCProjectTable($('locProjectTable'), projEntries, isMR, data);

  // Contributors tab
  const contribs = Object.values(contributorData).sort((a, b) => b.added - a.added);
  renderBarChart($('locContributorBars'), contribs.slice(0, 10), { valueKey: 'added', labelKey: 'name', height: Math.max(200, contribs.length * 30) });
  if (isMR) renderReviewFlow($('locReviewFlow'), detailRows);
  else $('locReviewFlow').innerHTML = '<div class="chart-empty">Review flow requires MR mode</div>';

  // Explorer tab
  $('locExplorer').innerHTML = '<div class="chart-empty">Click a project name in the Projects tab to explore</div>';

  // Switch to first LOC tab
  qs('[data-loc-tab="overview"]', $('locTabBar'))?.click();
}

// ─── LOC Treemap ────────────────────────────────────────
function renderTreemap(container, fileRows) {
  const extMap = {};
  for (const f of fileRows || []) { const k = f.ext || '?'; extMap[k] = (extMap[k] || 0) + 1; }
  const entries = Object.entries(extMap).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (entries.length === 0) { container.innerHTML = '<div class="chart-empty">No files</div>'; return; }
  const total = entries.reduce((s, e) => s + e[1], 0);
  const langColors = { js: '#f7df1e', jsx: '#61dafb', ts: '#3178c6', tsx: '#3178c6', py: '#3572A5', java: '#b07219', go: '#00ADD8', rs: '#dea584', rb: '#701516', php: '#4F5D95', css: '#563d7c', scss: '#c6538c', html: '#e34c26', json: '#292929', xml: '#0060ac', yml: '#cb171e', yaml: '#cb171e', md: '#083fa1', sql: '#e38c00', sh: '#89e051', dockerfile: '#384d54' };
  const rowH = Math.floor(220 / 3);
  const W = 600, H = 220;
  const svgEl = svg('svg', { width: '100%', height: H, viewBox: `0 0 ${W} ${H}` });
  entries.forEach(([ext, count], i) => {
    const col = i % 3; const row = Math.floor(i / 3);
    const w = Math.floor(W / 3 - 4); const rx = col * (W / 3) + 2; const ry = row * rowH + 2; const rh = rowH - 4;
    const rect = svg('rect', { x: rx, y: ry, width: w, height: rh, rx: '4', fill: langColors[ext] || getColor(i), opacity: '0.75', style: 'cursor:pointer;transition:opacity 0.15s' });
    const tip = `<div class="tt-header">.${ext}</div><div class="tt-row"><span>Files</span><strong>${count}</strong></div><div class="tt-row"><span>Share</span><strong>${Math.round(count / total * 100)}%</strong></div>`;
    rect.addEventListener('mouseenter', e => { rect.setAttribute('opacity', '1'); showTooltip(e, tip); });
    rect.addEventListener('mousemove', e => showTooltip(e, tip));
    rect.addEventListener('mouseleave', () => { rect.setAttribute('opacity', '0.75'); hideTooltip(); });
    svgEl.appendChild(rect);
    svgEl.appendChild(svg('text', { x: rx + 8, y: ry + 18, fill: '#fff', 'font-size': '13', 'font-weight': '700' }, `.${ext}`));
    svgEl.appendChild(svg('text', { x: rx + 8, y: ry + 34, fill: 'rgba(255,255,255,0.8)', 'font-size': '11' }, `${count} files`));
    svgEl.appendChild(svg('text', { x: rx + 8, y: ry + 50, fill: 'rgba(255,255,255,0.6)', 'font-size': '10' }, `${Math.round(count / total * 100)}%`));
  });
  container.innerHTML = ''; container.appendChild(svgEl);
}

// ─── LOC Ownership Risk ─────────────────────────────────
function renderOwnership(container, projects) {
  if (!projects || projects.length === 0) { container.innerHTML = '<div class="chart-empty">No data</div>'; return; }
  const sorted = [...projects].sort((a, b) => a.count - b.count);
  const maxCount = Math.max(...sorted.map(p => p.count), 1);
  const riskOf = c => c <= 2 ? 'high' : c <= 5 ? 'medium' : 'low';
  const riskColor = r => r === 'high' ? '#ef4444' : r === 'medium' ? '#f59e0b' : '#10b981';
  let html = `<div class="bf-grid"><div class="bf-row bf-header"><span class="bf-cell bf-repo">Repository</span><span class="bf-cell bf-count">MRs</span><span class="bf-cell bf-risk">Risk</span><span class="bf-cell bf-bar"></span></div>`;
  for (const p of sorted) {
    const risk = riskOf(p.count); const color = riskColor(risk);
    const label = risk === 'high' ? '🔴 Concentrated' : risk === 'medium' ? '🟡 Shared' : '🟢 Distributed';
    html += `<div class="bf-row"><span class="bf-cell bf-repo" title="${escHtml(p.name)}">${escHtml(p.name)}</span><span class="bf-cell bf-count">${p.count}</span><span class="bf-cell bf-risk"><span class="bf-badge" style="background:${color}20;color:${color};border-color:${color}40">${label}</span></span><span class="bf-cell bf-bar"><span class="bf-bar-fill" style="width:${Math.round(p.count / maxCount * 100)}%;background:${color}"></span></span></div>`;
  }
  html += `</div><div class="bf-footer"><span>🔴 1-2 MRs (concentrated)</span><span>🟡 3-5 MRs (shared)</span><span>🟢 6+ MRs (distributed)</span></div>`;
  container.innerHTML = html;
}

// ─── LOC Activity Calendar ──────────────────────────────
function renderLOCActivityCalendar(container, weeklyData, allProjNames) {
  const weeks = Object.keys(weeklyData).sort();
  if (weeks.length === 0) { container.innerHTML = '<div class="chart-empty">No data</div>'; return; }
  const cellSize = 12, cellGap = 3, labelW = 130;
  const projList = allProjNames.slice(0, 15);
  const H = 30 + projList.length * (cellSize + cellGap);
  const W = Math.max(400, labelW + weeks.length * (cellSize + cellGap) + 20);
  const maxVal = Math.max(...Object.values(weeklyData).flatMap(w => Object.values(w)), 1);
  const colors = ['var(--cal-empty)', 'var(--cal-level-1)', 'var(--cal-level-2)', 'var(--cal-level-3)', 'var(--cal-level-4)'];
  const svgEl = svg('svg', { width: '100%', height: H, viewBox: `0 0 ${W} ${H}` });
  weeks.forEach((w, i) => { if (i % 4 === 0) svgEl.appendChild(svg('text', { x: labelW + 2 + i * (cellSize + cellGap), y: 12, fill: 'var(--text-muted)', 'font-size': '8' }, w.slice(5))); });
  projList.forEach((proj, ri) => {
    const y = 24 + ri * (cellSize + cellGap);
    svgEl.appendChild(svg('text', { x: labelW - 4, y: y + cellSize - 2, 'text-anchor': 'end', fill: 'var(--text)', 'font-size': '9', 'font-weight': '500' }, proj.length > 18 ? proj.slice(0, 16) + '…' : proj));
    weeks.forEach((w, ci) => {
      const val = weeklyData[w]?.[proj] || 0;
      const level = val === 0 ? 0 : val <= maxVal * 0.25 ? 1 : val <= maxVal * 0.5 ? 2 : val <= maxVal * 0.75 ? 3 : 4;
      const cell = svg('rect', { x: labelW + ci * (cellSize + cellGap), y, width: cellSize, height: cellSize, rx: '3', fill: colors[level], style: 'cursor:pointer;transition:opacity 0.15s' });
      const tip = `<div class="tt-header">${escHtml(proj)}</div><div class="tt-row"><span>Week</span><strong>${w}</strong></div><div class="tt-row"><span>Activity</span><strong>${val}</strong></div>`;
      cell.addEventListener('mouseenter', e => { cell.setAttribute('opacity', '0.85'); showTooltip(e, tip); });
      cell.addEventListener('mousemove', e => showTooltip(e, tip));
      cell.addEventListener('mouseleave', () => { cell.setAttribute('opacity', '1'); hideTooltip(); });
      svgEl.appendChild(cell);
    });
  });
  container.innerHTML = ''; container.appendChild(svgEl);
}

// ─── LOC Project Table ──────────────────────────────────
function renderLOCProjectTable(container, projEntries, isMR, data) {
  if (projEntries.length === 0) { container.innerHTML = '<div class="chart-empty">No projects</div>'; return; }
  const s = isMR ? 'MRs' : 'Commits';
  container.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Project</th><th>${s}</th><th>Added</th><th>Deleted</th><th>Modified</th><th>Net</th><th>Actions</th></tr></thead><tbody id="locPTBody"></tbody></table></div>`;
  $('locPTBody').innerHTML = projEntries.map(p => `
    <tr><td style="font-weight:600">${escHtml(p.name)}</td><td>${p.count}</td><td class="text-added">+${fmt(p.added)}</td><td class="text-deleted">-${fmt(p.deleted)}</td><td>~${fmt(p.modified)}</td><td style="font-weight:700">${fmt(p.added + p.modified - p.deleted)}</td>
    <td><button class="btn-explore" data-project="${escHtml(p.name)}">🔍 Explore</button></td></tr>
  `).join('');
  qsa('.btn-explore').forEach(btn => btn.addEventListener('click', () => {
    const projName = btn.dataset.project;
    renderExplorer($('locExplorer'), projName, data);
    qs('[data-loc-tab="explorer"]', $('locTabBar'))?.click();
  }));
}

// ─── Review Flow ────────────────────────────────────────
function renderReviewFlow(container, mrRows) {
  if (!mrRows || mrRows.length === 0) { container.innerHTML = '<div class="chart-empty">No MR data</div>'; return; }
  const authorMap = {};
  for (const mr of mrRows) {
    if (!authorMap[mr.author]) authorMap[mr.author] = { count: 0, projects: new Set() };
    authorMap[mr.author].count++; authorMap[mr.author].projects.add(mr.project_name);
  }
  const authors = Object.entries(authorMap);
  if (authors.length === 0) { container.innerHTML = '<div class="chart-empty">No authors</div>'; return; }
  const W = 600, H = 260, cx = W / 2, cy = H / 2, radius = Math.min(W, H) / 2 - 40;
  const maxCount = Math.max(...authors.map(a => a[1].count), 1);
  const svgEl = svg('svg', { width: '100%', height: H, viewBox: `0 0 ${W} ${H}` });
  for (let i = 0; i < authors.length; i++) for (let j = i + 1; j < authors.length; j++) {
    const [_, da] = authors[i]; const [__, db] = authors[j];
    const shared = [...da.projects].filter(p => db.projects.has(p)).length;
    if (shared > 0) {
      const a1 = (i / authors.length) * Math.PI * 2 - Math.PI / 2;
      const a2 = (j / authors.length) * Math.PI * 2 - Math.PI / 2;
      svgEl.appendChild(svg('line', { x1: cx + radius * Math.cos(a1), y1: cy + radius * Math.sin(a1), x2: cx + radius * Math.cos(a2), y2: cy + radius * Math.sin(a2), stroke: 'var(--primary)', 'stroke-width': Math.min(3, shared), opacity: Math.min(0.1 + shared * 0.06, 0.5) }));
    }
  }
  authors.forEach(([name, data], i) => {
    const a = (i / authors.length) * Math.PI * 2 - Math.PI / 2;
    const x = cx + radius * Math.cos(a), y = cy + radius * Math.sin(a);
    const r = 6 + (data.count / maxCount) * 14;
    const circle = svg('circle', { cx: x, cy: y, r, fill: 'var(--primary)', opacity: '0.7', stroke: 'var(--card-bg)', 'stroke-width': '2', style: 'cursor:pointer;transition:opacity 0.15s' });
    const tip = `<div class="tt-header">${escHtml(name)}</div><div class="tt-row"><span>MRs</span><strong>${data.count}</strong></div><div class="tt-row"><span>Projects</span><strong>${data.projects.size}</strong></div>`;
    circle.addEventListener('mouseenter', e => { circle.setAttribute('opacity', '1'); showTooltip(e, tip); });
    circle.addEventListener('mousemove', e => showTooltip(e, tip));
    circle.addEventListener('mouseleave', () => { circle.setAttribute('opacity', '0.7'); hideTooltip(); });
    svgEl.appendChild(circle);
    svgEl.appendChild(svg('text', { x, y: y + r + 12, 'text-anchor': 'middle', fill: 'var(--text)', 'font-size': '8', 'font-weight': '600' }, name.length > 10 ? name.slice(0, 8) + '…' : name));
  });
  container.innerHTML = ''; container.appendChild(svgEl);
}

// ─── Explorer (Mindmap) ─────────────────────────────────
function renderExplorer(container, projName, data) {
  const projFiles = (data.fileRows || []).filter(f => f.project_name === projName);
  if (projFiles.length === 0) { container.innerHTML = `<div class="chart-empty">No files for ${escHtml(projName)}</div>`; return; }
  const tree = { name: projName, type: 'dir', children: [], totalAdded: 0, totalDeleted: 0, totalModified: 0 };
  const dirMap = { '': tree };
  for (const f of projFiles) {
    const parts = f.file.split('/'); const fileName = parts.pop(); let currentPath = '';
    for (const part of parts) {
      const parentPath = currentPath; currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (!dirMap[currentPath]) {
        const node = { name: part, type: 'dir', children: [], totalAdded: 0, totalDeleted: 0, totalModified: 0, parentPath };
        dirMap[parentPath || ''].children.push(node); dirMap[currentPath] = node;
      }
    }
    const fn = { name: fileName, type: 'file', ext: f.ext, added: f.added, deleted: f.deleted, modified: f.modified, net: f.net, parentPath: currentPath };
    dirMap[currentPath || ''].children.push(fn);
    let p = currentPath;
    while (p !== undefined) {
      if (dirMap[p]) { dirMap[p].totalAdded += f.added; dirMap[p].totalDeleted += f.deleted; dirMap[p].totalModified += f.modified; }
      p = dirMap[p]?.parentPath; if (p === '') break;
    }
    tree.totalAdded += f.added; tree.totalDeleted += f.deleted; tree.totalModified += f.modified;
  }
  let html = `<div class="mindmap-header"><strong>${escHtml(projName)}</strong><span class="text-muted"> — ${projFiles.length} files, +${fmt(tree.totalAdded)} / -${fmt(tree.totalDeleted)} / ~${fmt(tree.totalModified)}</span></div><div class="mindmap-tree">`;
  html += renderTreeNodes(tree); html += '</div>';
  container.innerHTML = html;
  qsa('.mm-toggle', container).forEach(btn => btn.addEventListener('click', () => {
    const ch = btn.parentElement.nextElementSibling;
    if (ch) { ch.style.display = ch.style.display === 'none' ? '' : 'none'; btn.textContent = ch.style.display === 'none' ? '▶' : '▼'; }
  }));
}
function renderTreeNodes(node) {
  if (node.type === 'file') {
    return `<div class="mm-node mm-file"><span class="mm-icon">📄</span>${node.ext ? `<span class="mm-ext">.${node.ext}</span>` : ''}<span class="mm-name">${escHtml(node.name)}</span><span class="mm-stats">+${node.added}/-${node.deleted}/${node.modified}</span><span class="mm-net ${node.net >= 0 ? 'text-added' : 'text-deleted'}">${node.net >= 0 ? '+' : ''}${node.net}</span></div>`;
  }
  const hasChildren = node.children?.length > 0;
  const toggle = hasChildren ? '<span class="mm-toggle">▼</span>' : '<span class="mm-toggle-placeholder"></span>';
  let html = `<div class="mm-node mm-dir">${toggle}<span class="mm-icon">${node.parentPath === undefined ? '📦' : '📁'}</span><span class="mm-name">${escHtml(node.name)}</span><span class="mm-stats">+${fmt(node.totalAdded)}/-${fmt(node.totalDeleted)}/${fmt(node.totalModified)}</span></div>`;
  if (hasChildren) {
    html += '<div class="mm-children">';
    for (const c of [...node.children].sort((a, b) => (b.totalAdded || b.net || 0) - (a.totalAdded || a.net || 0))) html += renderTreeNodes(c);
    html += '</div>';
  }
  return html;
}

// ─── Shared Three.js loader ──────────────────────────────
function loadThreeJS() {
  if (window.THREE && window.OrbitControls) {
    return Promise.resolve();
  }
  return import('./vendor/three.module.js').then(({ default: THREE_ }) => {
    window.THREE = THREE_;
    return import('./vendor/OrbitControls.js');
  }).then(({ OrbitControls: OC }) => {
    window.OrbitControls = OC;
  });
}

// ─── 3D Explorer (Three.js) ─────────────────────────────
let threeScene = null, threeCamera = null, threeRenderer = null;
let threeControls = null, threeAnimId = null;
const threeNodes = [];
const threeTooltipEl = document.getElementById('tooltip3d') || (() => {
  const el = document.createElement('div'); el.id = 'tooltip3d'; el.className = 'chart-tooltip';
  el.style.cssText = 'display:none;pointer-events:auto;position:fixed;z-index:9999';
  document.body.appendChild(el); return el;
})();

function build3DTree(treeData, container) {
  dispose3D();

  const W = container.clientWidth || 600;
  const H = container.clientHeight || 400;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000);
  camera.position.set(15, 10, 20);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  const controls = new window.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.autoRotate = false;
  controls.target.set(0, 0, 0);

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(10, 20, 10);
  scene.add(dirLight);
  const backLight = new THREE.DirectionalLight(0x8888ff, 0.4);
  backLight.position.set(-10, -5, -10);
  scene.add(backLight);

  // Floor grid for depth perception
  const gridHelper = new THREE.GridHelper(30, 20, 0x6366f1, 0x334155);
  gridHelper.position.y = -3;
  scene.add(gridHelper);

  const extColors = {
    js: 0xf7df1e, jsx: 0x61dafb, ts: 0x3178c6, tsx: 0x3178c6,
    py: 0x3572A5, java: 0xb07219, go: 0x00ADD8, rs: 0xdea584,
    rb: 0x701516, php: 0x4F5D95, css: 0x563d7c, scss: 0xc6538c,
    html: 0xe34c26, json: 0x292929, xml: 0x0060ac, yml: 0xcb171e,
    md: 0x083fa1, sql: 0xe38c00, sh: 0x89e051,
  };

  // Layout: assign positions with a simple radial cascade
  const nodeMap = new Map();
  const edges = [];
  let idx = 0;

  function layoutNode(node, parentPos, depth, angleOffset) {
    const isRoot = depth === 0;
    const isDir = node.type === 'dir';
    const r = isRoot ? 1.2 : isDir ? 0.7 : 0.35;
    const color = isRoot ? 0x6366f1 : isDir ? 0x22d3ee : (extColors[node.ext] || 0x94a3b8);

    // Position: spread children in a cone
    let pos;
    if (isRoot) {
      pos = new THREE.Vector3(0, 0, 0);
    } else {
      const spread = 2.5 + depth * 1.8;
      const count = parentPos ? 4 : 1;
      const angle = angleOffset + (idx % 12) * 0.52;
      const yOff = -0.5 + depth * 0.3;
      pos = new THREE.Vector3(
        parentPos.x + Math.cos(angle) * spread * 0.5,
        parentPos.y - 0.8 + Math.random() * 0.3,
        parentPos.z + Math.sin(angle) * spread * 0.5
      );
    }

    const geometry = new THREE.SphereGeometry(r, 16, 16);
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.3,
      metalness: 0.1,
      emissive: color,
      emissiveIntensity: isRoot ? 0.3 : 0.1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(pos);
    mesh.userData = { node, isDir, depth, label: node.name, ext: node.ext, stats: isDir ? `+${node.totalAdded}/-${node.totalDeleted}` : `+${node.added}/-${node.deleted}` };
    scene.add(mesh);
    nodeMap.set(node, mesh);
    threeNodes.push(mesh);

    // Glow ring for root
    if (isRoot) {
      const ringGeo = new THREE.RingGeometry(1.2, 1.6, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x6366f1, side: THREE.DoubleSide, transparent: true, opacity: 0.2 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(pos);
      ring.position.y -= 0.1;
      ring.rotation.x = -Math.PI / 2;
      scene.add(ring);
    }

    if (parentPos && !isRoot) {
      edges.push({ from: parentPos, to: pos, color });
    }

    if (node.children) {
      const sorted = [...node.children].sort((a, b) => (b.totalAdded || b.net || 0) - (a.totalAdded || a.net || 0));
      sorted.forEach((child, ci) => {
        idx++;
        layoutNode(child, pos, depth + 1, ci * 1.2);
      });
    }
  }

  layoutNode(treeData, null, 0, 0);

  // Draw edges as cylinders (better 3D look than lines)
  for (const edge of edges) {
    const from = edge.from;
    const to = edge.to;
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    dir.normalize();

    const cylGeo = new THREE.CylinderGeometry(0.03, 0.03, len, 4);
    const cylMat = new THREE.MeshStandardMaterial({ color: edge.color, transparent: true, opacity: 0.3 });
    const cyl = new THREE.Mesh(cylGeo, cylMat);
    cyl.position.copy(mid);
    cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    scene.add(cyl);
  }

  // Raycaster for hover
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered = null;

  renderer.domElement.addEventListener('pointermove', e => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(threeNodes);

    if (hovered) {
      hovered.material.emissiveIntensity = hovered.userData.isRoot ? 0.3 : 0.1;
      hovered = null;
      threeTooltipEl.style.display = 'none';
    }

    if (intersects.length > 0) {
      const obj = intersects[0].object;
      hovered = obj;
      obj.material.emissiveIntensity = 0.6;
      const d = obj.userData;
      const icon = d.isDir ? '📁' : '📄';
      const extBadge = d.ext ? `.${d.ext}` : '';
      threeTooltipEl.innerHTML = `<div class="tt-header">${icon} ${escHtml(d.label)}${extBadge}</div><div class="tt-row"><span>${d.isDir ? 'Directory' : 'File'}</span><strong>${d.stats}</strong></div>`;
      threeTooltipEl.style.display = 'block';
      const r = threeTooltipEl.getBoundingClientRect();
      let tx = e.clientX + 12, ty = e.clientY - r.height - 10;
      if (tx + r.width > window.innerWidth - 10) tx = e.clientX - r.width - 12;
      if (ty < 10) ty = e.clientY + 12;
      threeTooltipEl.style.left = tx + 'px';
      threeTooltipEl.style.top = ty + 'px';
    }
  });

  // Animation loop
  function animate() {
    threeAnimId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  threeScene = scene;
  threeCamera = camera;
  threeRenderer = renderer;
  threeControls = controls;

  // Resize handler
  const onResize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w > 0 && h > 0) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
  };
  window.addEventListener('resize', onResize);
  renderer.domElement._resizeHandler = onResize;
}

function dispose3D() {
  if (threeAnimId) { cancelAnimationFrame(threeAnimId); threeAnimId = null; }
  if (threeRenderer) {
    threeRenderer.dispose();
    threeRenderer.domElement.remove();
    if (threeRenderer.domElement._resizeHandler) {
      window.removeEventListener('resize', threeRenderer.domElement._resizeHandler);
    }
    threeRenderer = null;
  }
  threeScene = null;
  threeCamera = null;
  threeControls = null;
  threeNodes.length = 0;
}

// ─── Dashboard 3D Network Graph ──────────────────────────
let dash3dActive = false;

function build3DNetwork(data, container) {
  dispose3D();

  const W = container.clientWidth || 700;
  const H = container.clientHeight || 450;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000);
  camera.position.set(18, 12, 22);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  const controls = new window.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.8;
  controls.target.set(0, 0, 0);

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
  dirLight.position.set(10, 20, 10);
  scene.add(dirLight);
  const backLight = new THREE.DirectionalLight(0x8888ff, 0.4);
  backLight.position.set(-10, -5, -10);
  scene.add(backLight);

  // Floor grid
  const gridHelper = new THREE.GridHelper(30, 20, 0x6366f1, 0x334155);
  gridHelper.position.y = -4;
  scene.add(gridHelper);

  // Collect data from dashboard
  const { projects, contributorAgg } = data;
  const rawCommits = data.filteredCommits || data.rawCommits || [];
  const projList = Object.values(projects).sort((a, b) => b.commits - a.commits).slice(0, 15);
  const contribList = Object.values(contributorAgg || {}).sort((a, b) => Object.values(b.weeks).reduce((s, v) => s + v, 0) - Object.values(a.weeks).reduce((s, v) => s + v, 0)).slice(0, 15);

  if (projList.length === 0 && contribList.length === 0) return;

  // Build edge map: { projectName: { contributorName: count } }
  const edgeMap = {};
  const projNames = new Set(projList.map(p => p.name));
  const contribNames = new Set(contribList.map(c => c.name));
  for (const commit of (rawCommits || [])) {
    const pn = commit.project_name;
    const cn = commit.author_name || commit.author_email || '';
    if (projNames.has(pn) && contribNames.has(cn)) {
      if (!edgeMap[pn]) edgeMap[pn] = {};
      edgeMap[pn][cn] = (edgeMap[pn][cn] || 0) + 1;
    }
  }

  const allNodes = [];
  const maxProjCommits = Math.max(...projList.map(p => p.commits), 1);
  const maxContribCommits = Math.max(...contribList.map(c => Object.values(c.weeks).reduce((s, v) => s + v, 0)), 1);

  // Place projects on outer ring, contributors on inner ring
  const outerR = 8;
  const innerR = 4.5;

  projList.forEach((p, i) => {
    const angle = (i / projList.length) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * outerR;
    const z = Math.sin(angle) * outerR;
    const r = 0.6 + (p.commits / maxProjCommits) * 0.8;
    const color = 0x6366f1;
    const geo = new THREE.SphereGeometry(r, 20, 20);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.2, emissive: color, emissiveIntensity: 0.15 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0, z);
    mesh.userData = { type: 'project', label: p.name, stats: `${p.commits} commits, +${fmt(p.added)} / -${fmt(p.deleted)}` };
    scene.add(mesh);
    threeNodes.push(mesh);
    allNodes.push(mesh);
  });

  contribList.forEach((c, i) => {
    const angle = (i / contribList.length) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(angle) * innerR;
    const z = Math.sin(angle) * innerR;
    const total = Object.values(c.weeks).reduce((s, v) => s + v, 0);
    const r = 0.4 + (total / maxContribCommits) * 0.5;
    const color = 0x22d3ee;
    const geo = new THREE.SphereGeometry(r, 16, 16);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.1, emissive: color, emissiveIntensity: 0.1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0, z);
    mesh.userData = { type: 'contributor', label: c.name, stats: `${total} commits` };
    scene.add(mesh);
    threeNodes.push(mesh);
    allNodes.push(mesh);
  });

  // Draw edges as cylinders
  const maxEdgeCount = Math.max(...Object.values(edgeMap).flatMap(pm => Object.values(pm)), 1);
  for (const pn of Object.keys(edgeMap)) {
    const pMesh = allNodes.find(m => m.userData.label === pn && m.userData.type === 'project');
    if (!pMesh) continue;
    for (const cn of Object.keys(edgeMap[pn])) {
      const cMesh = allNodes.find(m => m.userData.label === cn && m.userData.type === 'contributor');
      if (!cMesh) continue;
      const count = edgeMap[pn][cn];
      const from = pMesh.position;
      const to = cMesh.position;
      const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
      const dir = new THREE.Vector3().subVectors(to, from);
      const len = dir.length();
      dir.normalize();
      const thickness = 0.04 + (count / maxEdgeCount) * 0.1;
      const cylGeo = new THREE.CylinderGeometry(thickness, thickness, len, 4);
      const cylMat = new THREE.MeshStandardMaterial({ color: 0x6366f1, transparent: true, opacity: 0.25 + (count / maxEdgeCount) * 0.4 });
      const cyl = new THREE.Mesh(cylGeo, cylMat);
      cyl.position.copy(mid);
      cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      scene.add(cyl);
    }
  }

  // Glow ring under each project
  projList.forEach((p, i) => {
    const angle = (i / projList.length) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * outerR;
    const z = Math.sin(angle) * outerR;
    const ringGeo = new THREE.RingGeometry(0.8, 1.1, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x6366f1, side: THREE.DoubleSide, transparent: true, opacity: 0.12 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(x, -0.1, z);
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);
  });

  // Raycaster hover
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered = null;

  renderer.domElement.addEventListener('pointermove', e => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(threeNodes);

    if (hovered) {
      hovered.material.emissiveIntensity = hovered.userData.type === 'project' ? 0.15 : 0.1;
      hovered = null;
      threeTooltipEl.style.display = 'none';
    }

    if (intersects.length > 0) {
      const obj = intersects[0].object;
      hovered = obj;
      obj.material.emissiveIntensity = 0.6;
      const d = obj.userData;
      const icon = d.type === 'project' ? '📦' : '👤';
      threeTooltipEl.innerHTML = `<div class="tt-header">${icon} ${escHtml(d.label)}</div><div class="tt-row"><span>${d.type === 'project' ? 'Repo' : 'Contributor'}</span><strong>${d.stats}</strong></div>`;
      threeTooltipEl.style.display = 'block';
      const r = threeTooltipEl.getBoundingClientRect();
      let tx = e.clientX + 12, ty = e.clientY - r.height - 10;
      if (tx + r.width > window.innerWidth - 10) tx = e.clientX - r.width - 12;
      if (ty < 10) ty = e.clientY + 12;
      threeTooltipEl.style.left = tx + 'px';
      threeTooltipEl.style.top = ty + 'px';
    }
  });

  // Animation loop
  function animate() {
    threeAnimId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  threeScene = scene;
  threeCamera = camera;
  threeRenderer = renderer;
  threeControls = controls;

  // Resize handler
  const onResize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w > 0 && h > 0) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
  };
  window.addEventListener('resize', onResize);
  renderer.domElement._resizeHandler = onResize;
}

function renderDashboard3D(data) {
  const container = $('dash3dContainer');
  container.innerHTML = '<div class="chart-empty">Loading 3D network...</div>';
  $('dashCharts').style.display = 'none';
  container.style.display = '';
  loadThreeJS().then(() => {
    build3DNetwork(data, container);
  }).catch(err => {
    container.innerHTML = `<div class="chart-empty">3D network failed: ${escHtml(err.message || err)}</div>`;
  });
}

function hideDashboard3D() {
  dispose3D();
  $('dash3dContainer').style.display = 'none';
  $('dashCharts').style.display = '';
  dash3dActive = false;
  $('dash3dToggle').textContent = '🌐 3D Network';
}

// ─── Dashboard 3D Toggle ─────────────────────────────────
$('dash3dToggle').addEventListener('click', () => {
  if (dash3dActive) { hideDashboard3D(); return; }
  if (!lastDashData) { return; }
  dash3dActive = true;
  $('dash3dToggle').textContent = '✕ Close 3D';
  renderDashboard3D(lastDashData);
});

// ─── Explorer 2D/3D Toggle ──────────────────────────────
$('explorer2dBtn').addEventListener('click', () => {
  $('explorer2dBtn').classList.add('active');
  $('explorer3dBtn').classList.remove('active');
  $('locExplorer').style.display = '';
  $('locExplorer3d').style.display = 'none';
  dispose3D();
});
$('explorer3dBtn').addEventListener('click', () => {
  $('explorer3dBtn').classList.add('active');
  $('explorer2dBtn').classList.remove('active');
  const projName = $('locExplorer').dataset.projectName;
  if (!projName || !locData) {
    $('locExplorer3d').innerHTML = '<div class="chart-empty">Click a project in the Projects tab first</div>';
  }
  $('locExplorer').style.display = 'none';
  $('locExplorer3d').style.display = '';
  if (projName && locData) {
    renderExplorer3D(projName, locData);
  }
});

function renderExplorer3D(projName, data) {
  const projFiles = (data.fileRows || []).filter(f => f.project_name === projName);
  if (projFiles.length === 0) {
    $('locExplorer3d').innerHTML = `<div class="chart-empty">No files for ${escHtml(projName)}</div>`;
    return;
  }
  // Build same tree as renderExplorer
  const tree = { name: projName, type: 'dir', children: [], totalAdded: 0, totalDeleted: 0, totalModified: 0 };
  const dirMap = { '': tree };
  for (const f of projFiles) {
    const parts = f.file.split('/'); const fileName = parts.pop(); let currentPath = '';
    for (const part of parts) {
      const parentPath = currentPath; currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (!dirMap[currentPath]) {
        const node = { name: part, type: 'dir', children: [], totalAdded: 0, totalDeleted: 0, totalModified: 0, parentPath };
        dirMap[parentPath || ''].children.push(node); dirMap[currentPath] = node;
      }
    }
    const fn = { name: fileName, type: 'file', ext: f.ext, added: f.added, deleted: f.deleted, modified: f.modified, net: f.net, parentPath: currentPath };
    dirMap[currentPath || ''].children.push(fn);
    let p = currentPath;
    while (p !== undefined) {
      if (dirMap[p]) { dirMap[p].totalAdded += f.added; dirMap[p].totalDeleted += f.deleted; dirMap[p].totalModified += f.modified; }
      p = dirMap[p]?.parentPath; if (p === '') break;
    }
    tree.totalAdded += f.added; tree.totalDeleted += f.deleted; tree.totalModified += f.modified;
  }

  const container = $('locExplorer3d');
  container.innerHTML = '<div class="chart-empty">Loading 3D engine...</div>';
  loadThreeJS().then(() => {
    container.innerHTML = '';
    build3DTree(tree, container);
  }).catch(err => {
    container.innerHTML = `<div class="chart-empty">3D engine failed: ${escHtml(err.message || err)}</div>`;
  });
}

// ─── Modify renderExplorer to store project name for 3D toggle
const _origRenderExplorer = renderExplorer;
renderExplorer = function(container, projName, data) {
  _origRenderExplorer(container, projName, data);
  $('locExplorer').dataset.projectName = projName;
};

// ─── Comparisons ────────────────────────────────────────
function setupComparison(currentData, reportType) {
  // Pre-fill compare dates relative to current report dates
  const curStart = new Date($('locStartDate').value || Date.now());
  const curEnd = new Date($('locEndDate').value || Date.now());
  const range = curEnd.getTime() - curStart.getTime();
  const prevEnd = new Date(curStart.getTime() - 86400000); // day before current start
  const prevStart = new Date(prevEnd.getTime() - range);

  $('locCompareStart').value = prevStart.toISOString().slice(0, 10);
  $('locCompareEnd').value = prevEnd.toISOString().slice(0, 10);
  $('locCompareSection').style.display = '';
  $('locCompareResults').style.display = 'none';

  // Replace old button with fresh one
  const oldBtn = $('locCompareBtn');
  const newBtn = oldBtn.cloneNode(true);
  oldBtn.parentNode.replaceChild(newBtn, oldBtn);
  newBtn.id = 'locCompareBtn';
  newBtn.addEventListener('click', () => runComparison(currentData, reportType));
}

async function runComparison(currentData, reportType) {
  const prevStart = $('locCompareStart').value;
  const prevEnd = $('locCompareEnd').value;
  if (!prevStart || !prevEnd) { alert('Enter both dates for the previous period.'); return; }
  if (prevEnd < prevStart) { alert('End must be >= start.'); return; }

  const baseUrl = $('sBaseUrl').value.trim();
  const token = $('sToken').value.trim();

  // Show progress bar
  $('locCompareProgress').style.display = '';
  $('locCompareBtn').disabled = true;
  $('locCompareResults').style.display = 'none';
  const setCompProg = (pct, text) => {
    $('locCompareProgressBar').style.width = pct + '%';
    $('locCompareProgressText').textContent = text;
  };
  setCompProg(2, 'Looking up user...');

  abortController = new AbortController();
  const signal = abortController.signal;

  try {
    // Determine user from same logic as startLOCReport
    let user;
    const userId = $('locUserId').value.trim();
    if (userId && /^\d+$/.test(userId)) {
      const uRes = await apiFetch(baseUrl, `/users/${userId}`, {}, token, signal);
      user = await uRes.json();
      if (!user || !user.id) throw new Error(`User not found for ID: ${userId}`);
    } else if (userId) {
      const uRes = await apiFetch(baseUrl, '/users', { search: userId }, token, signal);
      const users = await uRes.json();
      if (!Array.isArray(users) || users.length === 0) throw new Error(`User not found: ${userId}`);
      user = users[0];
    } else {
      const uRes = await apiFetch(baseUrl, '/user', {}, token, signal);
      user = await uRes.json();
      if (!user || !user.id) throw new Error('Could not determine current user');
    }
    setCompProg(8, `Fetching projects for ${prevStart} → ${prevEnd}...`);

    const projects = await paginate(baseUrl, '/projects', { membership: true }, token, signal);
    setCompProg(15, `Processing ${projects.length} projects...`);
    const prevData = reportType === 'mr'
      ? await generateMRReport(baseUrl, token, user, projects, prevStart, prevEnd, signal)
      : await generateCommitReport(baseUrl, token, user, projects, prevStart, prevEnd, signal);

    const ct = currentData.totals;
    const pt = prevData.totals;
    const diffVal = (a, b) => { const d = a - b; return `${d >= 0 ? '+' : ''}${fmt(d)}`; };
    const pctChg = (a, b) => b === 0 ? '—' : `${Math.round(((a - b) / b) * 100)}%`;

    const rows = [
      { label: 'Lines Added', cur: ct.total_added, prev: pt.total_added, up: 'up' },
      { label: 'Lines Deleted', cur: ct.total_deleted, prev: pt.total_deleted, up: 'down' },
      { label: 'Net LOC', cur: ct.total_net, prev: pt.total_net, up: 'up' },
      { label: reportType === 'mr' ? 'MRs' : 'Commits', cur: ct.total_items, prev: pt.total_items, up: 'up' },
      { label: 'Projects', cur: ct.total_projects, prev: pt.total_projects, up: 'up' },
    ];

    const label = reportType === 'mr' ? 'MRs' : 'Commits';

    $('locCompareResults').innerHTML = `
      <div style="margin-bottom:0.75rem;font-size:0.78rem;color:var(--text-muted)">
        Comparing <strong>${prevStart}</strong> → <strong>${prevEnd}</strong>
        <span style="margin:0 0.5rem">vs</span>
        <strong>${$('locStartDate').value}</strong> → <strong>${$('locEndDate').value}</strong>
      </div>
      <div class="compare-grid">
        <div class="compare-header"><span></span><span>Previous</span><span>Current</span><span>Change</span><span>%</span></div>
        ${rows.map(r => {
          const improved = r.up === 'up' ? r.cur >= r.prev : r.cur <= r.prev;
          return `<div class="compare-row">
            <span>${r.label}</span>
            <span>${fmt(r.prev)}</span>
            <span>${fmt(r.cur)}</span>
            <span class="${improved ? 'text-added' : 'text-deleted'}">${diffVal(r.cur, r.prev)}</span>
            <span class="${improved ? 'text-added' : 'text-deleted'}">${pctChg(r.cur, r.prev)}</span>
          </div>`;
        }).join('')}
      </div>`;
    $('locCompareResults').style.display = '';
  } catch (err) {
    $('locCompareResults').innerHTML = `<div class="error-banner">${escHtml(err.message)}</div>`;
    $('locCompareResults').style.display = '';
  } finally {
    $('locCompareProgress').style.display = 'none';
    $('locCompareBtn').disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════
//  Init
// ═══════════════════════════════════════════════════════════
(() => {
  initTooltip();
  const end = new Date();
  const start = new Date(); start.setDate(start.getDate() - 90);
  $('locStartDate').value = start.toISOString().slice(0, 10);
  $('locEndDate').value = end.toISOString().slice(0, 10);
})();
