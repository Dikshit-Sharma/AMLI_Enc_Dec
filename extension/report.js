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
  refreshDashboard3D();
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
    hide('viewApiLib');
    const viewMap = { dashboard: 'viewDashboard', 'loc-report': 'viewLocReport', 'api-lib': 'viewApiLib' };
    const viewId = viewMap[btn.dataset.view] || '';
    const el = viewId ? $(viewId) : null;
    if (el) {
      el.style.display = '';
      if (viewId === 'viewLocReport') {
        setTimeout(() => $('locFormSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      }
      if (viewId === 'viewApiLib') {
        if (apiLibData.length > 0) {
          hide('apiLibWelcome');
          renderApiLib(apiLibData);
        } else {
          // Auto-load from cache on view switch
          var baseUrl = $('sBaseUrl').value.trim();
          var token = $('sToken').value.trim();
          if (baseUrl && token) {
            try {
              var fnUrl = getFnUrl();
              var tokHash = hashToken(token);
              fetch(fnUrl + '?tokenHash=' + encodeURIComponent(tokHash) + '&baseUrl=' + encodeURIComponent(baseUrl))
                .then(function(resp) { return resp.json(); })
                .then(function(data) {
                  if (data && data.projects && data.projects.length > 0) {
                    var all = [];
                    for (var pi = 0; pi < data.projects.length; pi++) {
                      var p = data.projects[pi];
                      for (var ei = 0; ei < (p.endpoints || []).length; ei++) {
                        all.push(Object.assign({}, p.endpoints[ei], { repoName: p.projectName, repoUrl: p.projectUrl }));
                      }
                    }
                    if (all.length > 0) {
                      apiLibData = all;
                      hide('apiLibWelcome');
                      renderApiLib(all);
                      var rs3 = new Set(all.map(function(e) { return e.repoName; }));
                      var bs3 = new Set();
                      all.forEach(function(e) { (e.backendUrls || []).forEach(function(b) { bs3.add(b.url); }); });
                      var cs3 = new Set(all.map(function(e) { return e.controllerClass; }));
                      $('apiLibSummary').style.display = '';
                      $('apiLibSummary').innerHTML = '<div class="summary-card sc-items"><div class="sc-value">' + all.length + '</div><div class="sc-label">Endpoints</div></div><div class="summary-card sc-projects"><div class="sc-value">' + rs3.size + '</div><div class="sc-label">Repos</div></div><div class="summary-card sc-added"><div class="sc-value">' + bs3.size + '</div><div class="sc-label">Backend URLs</div></div><div class="summary-card sc-net"><div class="sc-value">' + cs3.size + '</div><div class="sc-label">Controllers</div></div>';
                      $('apiLibTabBar').style.display = '';
                      var ft3 = document.querySelector('#apiLibTabBar .tab-btn');
                      if (ft3) ft3.click();
                    }
                  }
                })
                .catch(function() {});
            } catch {}
          }
        }
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
  if (window.THREE && window.OrbitControls && window.CSS2DRenderer) {
    return Promise.resolve();
  }
  return import('./vendor/three.module.js').then(THREE_ => {
    window.THREE = THREE_;
    return import('./vendor/OrbitControls.js');
  }).then(({ OrbitControls: OC }) => {
    window.OrbitControls = OC;
    return import('./vendor/CSS2DRenderer.js');
  }).then(({ CSS2DRenderer: C2DR, CSS2DObject: C2DO }) => {
    window.CSS2DRenderer = C2DR;
    window.CSS2DObject = C2DO;
  });
}

// ─── 3D Explorer (Three.js) ─────────────────────────────
let threeScene = null, threeCamera = null, threeRenderer = null;
let threeLabelRenderer = null;
let threeControls = null, threeAnimId = null;
const threeNodes = [];
const threeEdgeMeshes = [];
let threeNodeTree = null; // hierarchical node data for expand/collapse

const threeTooltipEl = document.getElementById('tooltip3d') || (() => {
  const el = document.createElement('div'); el.id = 'tooltip3d'; el.className = 'chart-tooltip';
  el.style.cssText = 'display:none;pointer-events:auto;position:fixed;z-index:9999';
  document.body.appendChild(el); return el;
})();

// Pastel palette per branch
const BRANCH_PALETTE = [
  { node: 0xA8D8EA, edge: 0xA8D8EA, light: 0xC5E8F7 }, // sky
  { node: 0xAAE6C3, edge: 0xAAE6C3, light: 0xCCF0D8 }, // mint
  { node: 0xFFD4A8, edge: 0xFFD4A8, light: 0xFFE8CC }, // peach
  { node: 0xF9C6D9, edge: 0xF9C6D9, light: 0xFCE0EA }, // pink
  { node: 0xD5C6F9, edge: 0xD5C6F9, light: 0xE8DFFB }, // lavender
  { node: 0xFFE6A8, edge: 0xFFE6A8, light: 0xFFF2CC }, // yellow
  { node: 0xB8E6D0, edge: 0xB8E6D0, light: 0xD6F2E5 }, // sage
  { node: 0xF0C6E6, edge: 0xF0C6E6, light: 0xF8E2F2 }, // rose
];

function makeCurve(from, to, depth) {
  const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
  const offset = 0.8 + depth * 0.3;
  mid.y += offset;
  return new THREE.CatmullRomCurve3([from.clone(), mid, to.clone()]);
}

function makeLabel(text, color = '#555', subtext) {
  const div = document.createElement('div');
  if (subtext) {
    div.innerHTML = `<div style="text-align:center;line-height:1.3">${escHtml(text)}</div><div style="font-size:9px;opacity:0.65;text-align:center;line-height:1.3">${escHtml(subtext)}</div>`;
  } else {
    div.textContent = text;
  }
  div.style.cssText = `color:${color};font-family:var(--font);font-size:11px;font-weight:600;background:rgba(255,255,255,0.85);padding:3px 8px;border-radius:10px;border:1px solid rgba(0,0,0,0.06);box-shadow:0 2px 6px rgba(0,0,0,0.04);pointer-events:none;white-space:nowrap;max-width:150px;overflow:hidden;text-overflow:ellipsis;`;
  return new window.CSS2DObject(div);
}

function build3DTree(treeData, container) {
  dispose3D();

  const W = container.clientWidth || 600;
  const H = container.clientHeight || 400;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f7fa);

  const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 1000);
  camera.position.set(10, 7, 14);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = 1;
  renderer.toneMappingExposure = 1.1;
  container.innerHTML = '';
  container.style.position = 'relative';
  container.appendChild(renderer.domElement);

  const labelRenderer = new window.CSS2DRenderer();
  labelRenderer.setSize(W, H);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.left = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  container.appendChild(labelRenderer.domElement);

  const controls = new window.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 4;
  controls.maxDistance = 35;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.2;
  controls.target.set(0, 2, 0);

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.65);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xffffff, 0xddeeff, 0.6);
  scene.add(hemi);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(8, 15, 10);
  dirLight.castShadow = true;
  scene.add(dirLight);

  // Subtle floor shadow disc
  const shadowGeo = new THREE.CircleGeometry(10, 32);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.04, depthWrite: false });
  const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = -0.5;
  scene.add(shadowDisc);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hoveredObj = null;
  let hoveredEdges = [];

  // Simplify tree: only show directories, aggregate file counts
  function simplifyTree(node) {
    const files = [];
    const dirChildren = [];
    for (const c of (node.children || [])) {
      if (c.type === 'file') {
        files.push(c);
      } else {
        const s = simplifyTree(c);
        if (s) dirChildren.push(s);
      }
    }
    return {
      ...node,
      _files: files,
      children: dirChildren,
      _fileCount: files.length + dirChildren.reduce((s, c) => s + (c._fileCount || 0), 0),
    };
  }

  const simpleTree = simplifyTree(treeData);

  // Recursive layout (dirs only) — clean radial tree
  let branchCount = 0;
  const allGroup = [];

  function layoutNode(node, parentPos, depth, parentAngle, branchColor, parentNodeInfo) {
    const isRoot = depth === 0;
    const maxDepth = 3;

    let pos, radius, nodeAngle, fileCount = 0;

    if (isRoot) {
      pos = new THREE.Vector3(0, 0, 0);
      radius = 1.0;
      nodeAngle = -Math.PI / 2;
    } else if (depth <= maxDepth) {
      const children = parentNodeInfo ? parentNodeInfo.children : [];
      const childIdx = parentNodeInfo ? parentNodeInfo.children.indexOf(node) : 0;
      const totalChildren = Math.min(children.length, 8);
      if (childIdx >= 8) return null;

      const levelStep = 3.0;
      const radialDist = depth === 1 ? 4.5 : (depth === 2 ? 2.8 : 2.0);

      if (depth === 1) {
        nodeAngle = (childIdx / totalChildren) * Math.PI * 2 - Math.PI / 2;
        pos = new THREE.Vector3(
          Math.cos(nodeAngle) * radialDist,
          levelStep,
          Math.sin(nodeAngle) * radialDist
        );
      } else {
        const arcRange = Math.PI * 0.6;
        const halfArc = arcRange / 2;
        nodeAngle = parentAngle + (totalChildren > 1 ?
          (childIdx / (totalChildren - 1)) * arcRange - halfArc : 0);
        pos = new THREE.Vector3(
          parentPos.x + Math.cos(nodeAngle) * radialDist,
          parentPos.y + levelStep,
          parentPos.z + Math.sin(nodeAngle) * radialDist
        );
      }

      fileCount = node._fileCount || 0;
      radius = 0.35 + Math.min(fileCount / 60, 0.55);
    } else {
      return null;
    }

    const colorIdx = branchColor !== undefined ? branchColor :
      (isRoot ? 0 : ((branchCount++) % BRANCH_PALETTE.length));
    const pal = BRANCH_PALETTE[colorIdx % BRANCH_PALETTE.length];

    // Create sphere — dashboard-like material
    const geo = new THREE.SphereGeometry(radius, 28, 28);
    const mat = new THREE.MeshPhysicalMaterial({
      color: pal.node,
      roughness: 0.25,
      metalness: 0.05,
      clearcoat: 0.1,
      emissive: pal.node,
      emissiveIntensity: isRoot ? 0.25 : 0.08,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.castShadow = true;
    mesh.userData = {
      node, isDir: true, depth, label: node.name,
      stats: `${fileCount} files · +${fmt(node.totalAdded)}/-${fmt(node.totalDeleted)}`,
      pal, isRoot, fileCount, files: node._files || [],
    };
    scene.add(mesh);
    threeNodes.push(mesh);

    // Label with subtext (like dashboard)
    const labelColor = isRoot ? '#444' : '#666';
    const subtext = isRoot ? `${fileCount} total files` : `${fileCount} files · +${fmt(node.totalAdded)}/-${fmt(node.totalDeleted)}`;
    const label = makeLabel(node.name, labelColor, subtext);
    label.position.copy(pos);
    label.position.y -= radius + 0.45;
    scene.add(label);

    // Root glow rings
    if (isRoot) {
      for (let ri = 0; ri < 3; ri++) {
        const ringGeo = new THREE.RingGeometry(radius + 0.2 + ri * 0.4, radius + 0.35 + ri * 0.4, 40);
        const ringMat = new THREE.MeshBasicMaterial({
          color: pal.node, side: THREE.DoubleSide, transparent: true, opacity: 0.15 - ri * 0.04,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(pos);
        ring.position.y -= 0.05;
        ring.rotation.x = -Math.PI / 2;
        scene.add(ring);
      }
    }

    // Ring under each node (matched dashboard style)
    const ringSize = Math.max(radius * 1.4, 0.5);
    const nodeRing = new THREE.Mesh(
      new THREE.RingGeometry(ringSize * 0.85, ringSize, 24),
      new THREE.MeshBasicMaterial({ color: pal.node, side: THREE.DoubleSide, transparent: true, opacity: 0.1 })
    );
    nodeRing.position.copy(pos);
    nodeRing.position.y = -0.47;
    nodeRing.rotation.x = -Math.PI / 2;
    scene.add(nodeRing);

    // Shadow dot
    const dotGeo = new THREE.CircleGeometry(radius * 1.3, 12);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.04, depthWrite: false });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.copy(pos);
    dot.position.y = -0.48;
    dot.rotation.x = -Math.PI / 2;
    scene.add(dot);

    // Edge to parent
    const edgeMeshes = [];
    if (parentPos && !isRoot) {
      const curve = makeCurve(parentPos, pos, depth);
      const tubeGeo = new THREE.TubeGeometry(curve, 10, 0.03 + radius * 0.025, 5, false);
      const tubeMat = new THREE.MeshPhysicalMaterial({
        color: pal.edge, transparent: true, opacity: 0.3, roughness: 0.5,
      });
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      scene.add(tube);
      edgeMeshes.push(tube);
      threeEdgeMeshes.push(tube);
    }

    const nodeInfo = {
      node, mesh, label, children: [], edgeMeshes,
      expanded: true, depth, pal, radius, pos, fileCount,
      files: node._files || [],
    };
    allGroup.push(nodeInfo);

    // Recurse children (dirs only)
    if (node.children && node.children.length > 0 && depth < maxDepth) {
      const sorted = [...node.children].sort((a, b) => (b._fileCount || 0) - (a._fileCount || 0));
      nodeInfo.children = sorted.map(child =>
        layoutNode(child, pos, depth + 1, nodeAngle, colorIdx, { node, children: sorted })
      ).filter(Boolean);
      for (const c of nodeInfo.children) {
        if (c) edgeMeshes.push(...c.edgeMeshes);
      }
    }

    return nodeInfo;
  }

  threeNodeTree = layoutNode(simpleTree, null, 0, 0, 0, null);

  // Click: show file details on directory nodes
  renderer.domElement.addEventListener('click', e => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(threeNodes);
    if (hits.length > 0) {
      const obj = hits[0].object;
      const info = allGroup.find(g => g.mesh === obj);
      if (info && info.isDir && !info.isRoot) {
        // Toggle expand/collapse
        info.expanded = !info.expanded;
        function animBranch(nodeInfo, show) {
          const s = show ? 1 : 0;
          for (const c of nodeInfo.children) {
            if (!c) continue;
            c.mesh.scale.setScalar(s);
            c.label.element.style.display = show ? '' : 'none';
            for (const e of c.edgeMeshes) e.scale.set(1, s, 1);
            if (!show || !c.expanded) animBranch(c, show && c.expanded);
          }
        }
        animBranch(info, info.expanded);
        info.mesh.material.emissiveIntensity = info.expanded ? 0.06 : 0.3;
      }
      // Show file list in tooltip for any dir click
      if (info) {
        const files = info.files || [];
        const allDescendantFiles = collectFiles(info.node);
        const totalFiles = allDescendantFiles.length;
        const dirTip = info.isRoot ? '' : `<div class="tt-row"><span>Subdirectories</span><strong>${info.node.children?.filter(c => c.type === 'dir').length || 0}</strong></div><div class="tt-row"><span>Files</span><strong>${totalFiles}</strong></div>`;
        const sampleFiles = allDescendantFiles.slice(0, 8).map(f =>
          `<div class="tt-row"><span>📄 ${escHtml(f.name || f.file || '?')}</span><strong>+${f.added || 0}/-${f.deleted || 0}</strong></div>`
        ).join('');
        const more = allDescendantFiles.length > 8 ? `<div class="tt-row" style="color:var(--text-muted)">… and ${allDescendantFiles.length - 8} more</div>` : '';
        threeTooltipEl.innerHTML = `
          <div class="tt-header">📁 ${escHtml(info.node.name)}</div>
          <div class="tt-row"><span>Lines</span><strong>+${fmt(info.node.totalAdded)}/-${fmt(info.node.totalDeleted)}</strong></div>
          ${dirTip}
          ${totalFiles > 0 ? `<div style="border-top:1px solid var(--border);margin:0.3rem 0;padding-top:0.3rem;font-size:0.7rem;font-weight:600;color:var(--text-muted)">FILES</div>${sampleFiles}${more}` : ''}
          <div style="margin-top:0.3rem;font-size:0.65rem;color:var(--text-muted)">${info.expanded ? '▼ Click to collapse' : '▶ Click to expand'}</div>`;
        threeTooltipEl.style.display = 'block';
        const r = threeTooltipEl.getBoundingClientRect();
        let tx = e.clientX + 12, ty = e.clientY - r.height - 10;
        if (tx + r.width > window.innerWidth - 10) tx = e.clientX - r.width - 12;
        if (ty < 10) ty = e.clientY + 12;
        threeTooltipEl.style.left = tx + 'px';
        threeTooltipEl.style.top = ty + 'px';
      }
    }
  });

  function collectFiles(node) {
    let all = [...(node._files || [])];
    for (const c of (node.children || [])) {
      all = all.concat(collectFiles(c));
    }
    return all;
  }

  // Hover
  renderer.domElement.addEventListener('pointermove', e => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(threeNodes);

    // Reset previous hover
    if (hoveredObj) {
      hoveredObj.scale.setScalar(1);
      hoveredObj.material.emissiveIntensity = hoveredObj.userData.isRoot ? 0.25 : (hoveredObj.userData.isDir ? 0.08 : 0.08);
      for (const e of hoveredEdges) e.material.opacity = 0.35;
      hoveredEdges = [];
      hoveredObj = null;
      threeTooltipEl.style.display = 'none';
    }

    if (hits.length > 0) {
      const obj = hits[0].object;
      hoveredObj = obj;
      obj.scale.setScalar(1.3);
      obj.material.emissiveIntensity = 0.5;

      // Highlight connected edges
      const info = allGroup.find(g => g.mesh === obj);
      if (info) {
        for (const e of info.edgeMeshes) { e.material.opacity = 0.7; hoveredEdges.push(e); }
        for (const c of info.children) {
          if (!c) continue;
          for (const e of c.edgeMeshes) { e.material.opacity = 0.7; hoveredEdges.push(e); }
        }
      }

      const d = obj.userData;
      const icon = d.isDir ? '📁' : '📄';
      const ext = d.ext ? `.${d.ext}` : '';
      threeTooltipEl.innerHTML = `<div class="tt-header">${icon} ${escHtml(d.label)}${ext}</div><div class="tt-row"><span>${d.isDir ? 'Directory' : 'File'}</span><strong>${d.stats}</strong></div>`;
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
    labelRenderer.render(scene, camera);
  }
  animate();

  threeScene = scene;
  threeCamera = camera;
  threeRenderer = renderer;
  threeLabelRenderer = labelRenderer;
  threeControls = controls;

  const onResize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w > 0 && h > 0) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      labelRenderer.setSize(w, h);
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
  if (threeLabelRenderer) {
    threeLabelRenderer.domElement.remove();
    threeLabelRenderer = null;
  }
  threeScene = null;
  threeCamera = null;
  threeControls = null;
  threeNodes.length = 0;
  threeEdgeMeshes.length = 0;
  threeNodeTree = null;
}

// ─── Dashboard 3D Network Graph ──────────────────────────
let dash3dActive = false;

function build3DNetwork(data, container) {
  dispose3D();

  const W = container.clientWidth || 800;
  const H = container.clientHeight || 600;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f7fa);

  const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 1000);
  camera.position.set(22, 14, 28);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = 1;
  renderer.toneMappingExposure = 1.1;
  container.innerHTML = '';
  container.style.position = 'relative';
  container.appendChild(renderer.domElement);

  const labelRenderer = new window.CSS2DRenderer();
  labelRenderer.setSize(W, H);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.left = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  container.appendChild(labelRenderer.domElement);

  const controls = new window.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 8;
  controls.maxDistance = 60;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.6;
  controls.target.set(0, 0, 0);

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xffffff, 0xddeeff, 0.5);
  scene.add(hemi);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(8, 15, 10);
  scene.add(dirLight);

  // Floor shadow
  const shadowGeo = new THREE.CircleGeometry(18, 32);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.025, depthWrite: false });
  const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = -0.5;
  scene.add(shadowDisc);

  // Data
  const { projects, contributorAgg } = data;
  const rawCommits = data.filteredCommits || data.rawCommits || [];
  const contribList = Object.values(contributorAgg || {}).sort((a, b) => Object.values(b.weeks).reduce((s, v) => s + v, 0) - Object.values(a.weeks).reduce((s, v) => s + v, 0)).slice(0, 12);
  const contribNames = new Set(contribList.map(c => c.name));

  // Only include repos that have commits from top contributors
  const activeRepos = new Set();
  for (const commit of rawCommits) {
    const cn = commit.author_name || commit.author_email || '';
    if (contribNames.has(cn)) activeRepos.add(commit.project_name);
  }
  const projList = Object.values(projects)
    .filter(p => activeRepos.has(p.name))
    .sort((a, b) => b.commits - a.commits);

  if (projList.length === 0 && contribList.length === 0) return;

  const outerR = 14;
  const innerR = 9;

  // Edge map (repo ↔ contributor connections)
  const edgeMap = {};
  const projNames = new Set(projList.map(p => p.name));
  for (const commit of rawCommits) {
    const pn = commit.project_name;
    const cn = commit.author_name || commit.author_email || '';
    if (projNames.has(pn) && contribNames.has(cn)) {
      if (!edgeMap[pn]) edgeMap[pn] = {};
      edgeMap[pn][cn] = (edgeMap[pn][cn] || 0) + 1;
    }
  }

  const allNodes = [];
  const allNodeData = [];
  const maxProj = Math.max(...projList.map(p => p.commits), 1);
  const maxContrib = Math.max(...contribList.map(c => Object.values(c.weeks).reduce((s, v) => s + v, 0)), 1);
  let selectedNode = null;

  // ─── Create repo nodes (outer ring) ──────────────────────
  projList.forEach((p, i) => {
    const angle = (i / projList.length) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * outerR;
    const z = Math.sin(angle) * outerR;
    const r = 0.55 + (p.commits / maxProj) * 0.65;
    const pal = BRANCH_PALETTE[i % BRANCH_PALETTE.length];
    const geo = new THREE.SphereGeometry(r, 24, 24);
    const mat = new THREE.MeshPhysicalMaterial({ color: pal.node, roughness: 0.25, metalness: 0.05, clearcoat: 0.1, emissive: pal.node, emissiveIntensity: 0.08 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0, z);
    mesh.castShadow = true;
    const statsStr = `${p.commits} commits · +${fmt(p.added)} / -${fmt(p.deleted)}`;
    mesh.userData = { type: 'repo', label: p.name, stats: statsStr, pal };
    scene.add(mesh);
    threeNodes.push(mesh);
    allNodes.push(mesh);

    const nd = { mesh, type: 'repo', label: p.name, stats: statsStr, connectedNodes: [], edges: [] };
    allNodeData.push(nd);

    const displayLabel = p.name.length > 18 ? p.name.slice(0, 16) + '…' : p.name;
    const label = makeLabel(displayLabel, '#555', `${p.commits} commits`);
    label.position.set(x, -r - 0.5, z);
    scene.add(label);

    // Ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r + 0.15, r + 0.35, 28),
      new THREE.MeshBasicMaterial({ color: pal.node, side: THREE.DoubleSide, transparent: true, opacity: 0.1 })
    );
    ring.position.set(x, -0.05, z);
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);
  });

  // ─── Create contributor nodes (inner ring) ───────────────
  contribList.forEach((c, i) => {
    const angle = (i / contribList.length) * Math.PI * 2 + Math.PI / 6;
    const x = Math.cos(angle) * innerR;
    const z = Math.sin(angle) * innerR;
    const total = Object.values(c.weeks).reduce((s, v) => s + v, 0);
    const r = 0.4 + (total / maxContrib) * 0.5;
    const pal = BRANCH_PALETTE[(i + 3) % BRANCH_PALETTE.length];
    const geo = new THREE.SphereGeometry(r, 20, 20);
    const mat = new THREE.MeshPhysicalMaterial({ color: pal.node, roughness: 0.3, metalness: 0.05, emissive: pal.node, emissiveIntensity: 0.06 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.2, z);
    mesh.castShadow = true;
    const statsStr = `${total} commits`;
    mesh.userData = { type: 'contributor', label: c.name, stats: statsStr, pal };
    scene.add(mesh);
    threeNodes.push(mesh);
    allNodes.push(mesh);

    const nd = { mesh, type: 'contributor', label: c.name, stats: statsStr, connectedNodes: [], edges: [] };
    allNodeData.push(nd);

    const displayLabel = c.name.length > 18 ? c.name.slice(0, 16) + '…' : c.name;
    const label = makeLabel(displayLabel, '#666', `${total} commits`);
    label.position.set(x, -r - 0.45, z);
    scene.add(label);
  });

  // ─── Curved edges between repos and contributors ────────
  const edgeTubeMap = [];
  const maxEdge = Math.max(...Object.values(edgeMap).flatMap(pm => Object.values(pm)), 1);
  for (const pn of Object.keys(edgeMap)) {
    const pMesh = allNodes.find(m => m.userData.label === pn && m.userData.type === 'repo');
    if (!pMesh) continue;
    for (const cn of Object.keys(edgeMap[pn])) {
      const cMesh = allNodes.find(m => m.userData.label === cn && m.userData.type === 'contributor');
      if (!cMesh) continue;
      const count = edgeMap[pn][cn];
      const curve = makeCurve(pMesh.position, cMesh.position, 1);
      const thick = 0.025 + (count / maxEdge) * 0.1;
      const opacity = 0.15 + (count / maxEdge) * 0.35;
      const tubeMat = new THREE.MeshPhysicalMaterial({ color: BRANCH_PALETTE[4].edge, transparent: true, opacity, roughness: 0.5 });
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, thick, 5, false), tubeMat);
      scene.add(tube);
      threeEdgeMeshes.push(tube);
      edgeTubeMap.push({ tube, fromLabel: pn, toLabel: cn, origOpacity: opacity });

      // Wire up connection tracking
      const pData = allNodeData.find(d => d.mesh === pMesh);
      const cData = allNodeData.find(d => d.mesh === cMesh);
      if (pData) { pData.connectedNodes.push(cMesh); pData.edges.push(tube); }
      if (cData) { cData.connectedNodes.push(pMesh); cData.edges.push(tube); }
    }
  }

  // ─── Highlight / dim helpers ─────────────────────────────
  function highlightChain(nodeData) {
    // Dim everything
    for (const nd of allNodeData) {
      nd.mesh.material.emissiveIntensity = 0.02;
      nd.mesh.scale.setScalar(1);
    }
    for (const e of threeEdgeMeshes) {
      const et = edgeTubeMap.find(t => t.tube === e);
      e.material.opacity = et ? et.origOpacity * 0.15 : 0.03;
    }
    if (!nodeData) return;
    // Brighten selected node
    nodeData.mesh.material.emissiveIntensity = 0.5;
    nodeData.mesh.scale.setScalar(1.3);
    // Brighten connected nodes and edges
    for (const cn of nodeData.connectedNodes) {
      const nd = allNodeData.find(d => d.mesh === cn);
      if (nd) nd.mesh.material.emissiveIntensity = 0.35;
      cn.scale.setScalar(1.15);
    }
    for (const e of nodeData.edges) {
      e.material.opacity = 0.8;
    }
  }

  function resetChainHighlight() {
    for (const nd of allNodeData) {
      nd.mesh.material.emissiveIntensity = nd.type === 'repo' ? 0.08 : 0.06;
      nd.mesh.scale.setScalar(1);
    }
    for (const e of threeEdgeMeshes) {
      const et = edgeTubeMap.find(t => t.tube === e);
      e.material.opacity = et ? et.origOpacity : 0.2;
    }
  }

  // ─── Build chain tooltip ─────────────────────────────────
  function buildChainTooltip(nodeData) {
    const icon = nodeData.type === 'repo' ? '📦' : '👤';
    const typeLabel = nodeData.type === 'repo' ? 'Repository' : 'Contributor';
    let html = `<div class="tt-header">${icon} ${escHtml(nodeData.label)}</div>`;
    html += `<div class="tt-row"><span>${typeLabel}</span><strong>${nodeData.stats}</strong></div>`;
    if (nodeData.connectedNodes.length > 0) {
      const connType = nodeData.type === 'repo' ? 'Contributors' : 'Repos';
      const connIcon = nodeData.type === 'repo' ? '👤' : '📦';
      html += `<div style="border-top:1px solid var(--border);margin:0.35rem 0;padding-top:0.35rem;font-size:0.7rem;font-weight:600;color:var(--text-muted)">CONNECTED ${connType.toUpperCase()} (click to follow chain)</div>`;
      for (const cn of nodeData.connectedNodes) {
        const nd = allNodeData.find(d => d.mesh === cn);
        if (!nd) continue;
        html += `<div style="display:flex;justify-content:space-between;gap:0.5rem;padding:0.15rem 0;cursor:pointer" data-chain-select="${escHtml(nd.label)}" data-chain-type="${nd.type}">
          <span>${connIcon} ${escHtml(nd.label.length > 20 ? nd.label.slice(0, 18) + '…' : nd.label)}</span>
          <strong style="font-size:0.7rem">${nd.stats}</strong>
        </div>`;
      }
    }
    html += `<div style="margin-top:0.3rem;font-size:0.6rem;color:var(--text-muted)">🔄 Click a connected node to navigate the chain</div>`;
    return html;
  }

  // ─── Show tooltip at position ────────────────────────────
  function showChainTooltip(clientX, clientY, html) {
    threeTooltipEl.innerHTML = html;
    threeTooltipEl.style.display = 'block';
    const r = threeTooltipEl.getBoundingClientRect();
    let tx = clientX + 12, ty = clientY - r.height - 10;
    if (tx + r.width > window.innerWidth - 10) tx = clientX - r.width - 12;
    if (ty < 10) ty = clientY + 12;
    threeTooltipEl.style.left = tx + 'px';
    threeTooltipEl.style.top = ty + 'px';
  }

  // ─── Tooltip chain navigation ────────────────────────────
  if (threeTooltipEl._chainListener) {
    threeTooltipEl.removeEventListener('click', threeTooltipEl._chainListener);
  }
  const chainHandler = e => {
    const row = e.target.closest('[data-chain-select]');
    if (!row) return;
    const label = row.dataset.chainSelect;
    const type = row.dataset.chainType;
    const nd = allNodeData.find(d => d.label === label && d.type === type);
    if (!nd) return;
    selectedNode = nd;
    highlightChain(nd);
    showChainTooltip(e.clientX, e.clientY, buildChainTooltip(nd));
  };
  threeTooltipEl.addEventListener('click', chainHandler);
  threeTooltipEl._chainListener = chainHandler;

  // ─── Raycaster (shared between click and hover) ─────────
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hoveredObj = null;

  // ─── Click handler ───────────────────────────────────────
  renderer.domElement.addEventListener('click', e => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(threeNodes);

    if (hits.length > 0) {
      const obj = hits[0].object;
      const nd = allNodeData.find(d => d.mesh === obj);
      if (nd) {
        if (selectedNode === nd) {
          selectedNode = null;
          resetChainHighlight();
          threeTooltipEl.style.display = 'none';
        } else {
          selectedNode = nd;
          highlightChain(nd);
          showChainTooltip(e.clientX, e.clientY, buildChainTooltip(nd));
        }
        return;
      }
    }
    selectedNode = null;
    resetChainHighlight();
    threeTooltipEl.style.display = 'none';
  });

  // ─── Hover handler ───────────────────────────────────────

  renderer.domElement.addEventListener('pointermove', e => {
    if (selectedNode) {
      // Keep chain visible, just update hover if on non-selected
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(threeNodes);

      if (hoveredObj && hoveredObj !== selectedNode.mesh) {
        hoveredObj.scale.setScalar(1);
        hoveredObj = null;
      }
      if (hits.length > 0) {
        const obj = hits[0].object;
        if (obj !== selectedNode.mesh) {
          hoveredObj = obj;
          obj.scale.setScalar(1.15);
        }
      }
      return;
    }

    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(threeNodes);

    if (hoveredObj) {
      hoveredObj.scale.setScalar(1);
      hoveredObj.material.emissiveIntensity =
        (hoveredObj.userData.type === 'repo' ? 0.08 : 0.06);
      hoveredObj = null;
      threeTooltipEl.style.display = 'none';
    }

    if (hits.length > 0) {
      const obj = hits[0].object;
      hoveredObj = obj;
      obj.scale.setScalar(1.25);
      obj.material.emissiveIntensity = 0.4;

      const d = obj.userData;
      const icon = d.type === 'repo' ? '📦' : '👤';
      const tipHtml = `<div class="tt-header">${icon} ${escHtml(d.label)}</div><div class="tt-row"><span>${d.type === 'repo' ? 'Repository' : 'Contributor'}</span><strong>${d.stats}</strong></div><div style="margin-top:0.3rem;font-size:0.65rem;color:var(--text-muted)">🖱 Click to explore connections</div>`;
      showChainTooltip(e.clientX, e.clientY, tipHtml);
    }
  });

  // ─── Animation loop ──────────────────────────────────────
  function animate() {
    threeAnimId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }
  animate();

  threeScene = scene;
  threeCamera = camera;
  threeRenderer = renderer;
  threeLabelRenderer = labelRenderer;
  threeControls = controls;

  const onResize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w > 0 && h > 0) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      labelRenderer.setSize(w, h);
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

function refreshDashboard3D() {
  if (!dash3dActive || !lastDashData) return;
  const container = $('dash3dContainer');
  loadThreeJS().then(() => {
    build3DNetwork(lastDashData, container);
  }).catch(err => {
    container.innerHTML = `<div class="chart-empty">3D refresh failed: ${escHtml(err.message || err)}</div>`;
  });
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
//  API LIB
// ═══════════════════════════════════════════════════════════
let apiLibData = [];
let apiLibUnlinkedUrls = [];
let apiLibAbortController = null;

$('apiLibScanBtn').addEventListener('click', () => scanApiLib(true));
$('apiLibSearch').addEventListener('input', () => {
  if (apiLibData.length > 0) renderApiLib(apiLibData);
});
$('apiLibExportBtn').addEventListener('click', exportApiLibCsv);
$('apiLibReportBtn').addEventListener('click', downloadApiLibReport);
$('apiLibHasUrlToggle').addEventListener('change', function() {
  if (apiLibData.length > 0) renderApiLib(apiLibData);
});

// API LIB tab navigation
document.querySelectorAll('#apiLibTabBar .tab-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('#apiLibTabBar .tab-btn').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    document.querySelectorAll('.api-lib-tab-panel').forEach(function(p) { p.classList.remove('active'); p.style.display = 'none'; });
    var tabId = 'apiLibTab' + btn.dataset.apiLibTab.charAt(0).toUpperCase() + btn.dataset.apiLibTab.slice(1);
    var panel = $(tabId);
    if (panel) { panel.classList.add('active'); panel.style.display = ''; }
    // Activate tab-specific render
    if (btn.dataset.apiLibTab === 'overview' && apiLibData.length > 0) renderApiLibOverview(apiLibData);
    if (btn.dataset.apiLibTab === 'unlinked' && apiLibData.length > 0) renderApiLibUnlinked(apiLibData);
    if (btn.dataset.apiLibTab === 'depmap') showApiLibDepmap();
    if (btn.dataset.apiLibTab === 'crossrepo') showApiLibCrossrepo();
  });
});

function getFnUrl() {
  return 'https://amliai.netlify.app/api/api-lib-cache';
}

async function fetchApiLibProjects(baseUrl, token, signal) {
  try {
    return await paginate(baseUrl, '/projects', { membership: true, per_page: 100 }, token, signal);
  } catch { return []; }
}

function hashToken(t) {
  let h = 0;
  for (let i = 0; i < t.length; i++) { h = ((h << 5) - h) + t.charCodeAt(i); h |= 0; }
  return 'h' + Math.abs(h).toString(36);
}

// ─── Main scan ───────────────────────────────────────────
async function scanApiLib(forceRefresh) {
  const baseUrl = $('sBaseUrl').value.trim();
  const token = $('sToken').value.trim();
  if (!baseUrl || !token) { setStatus('Enter URL and token', true); return; }

  hide('apiLibWelcome');
  hide('apiLibEmpty');
  hide('apiLibResults');
  show('apiLibProgress');
  $('apiLibProgressText').textContent = 'Loading...';
  $('apiLibProgressBar').style.width = '0%';
  $('apiLibSearch').value = '';

  // Try Firestore cache first
  if (!forceRefresh) {
    try {
      const fnUrl = getFnUrl();
      const tokHash = hashToken(token);
      const resp = await fetch(`${fnUrl}?tokenHash=${encodeURIComponent(tokHash)}&baseUrl=${encodeURIComponent(baseUrl)}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.projects && data.projects.length > 0) {
          const all = [];
          for (const p of data.projects) {
            for (const ep of (p.endpoints || [])) {
              all.push({ ...ep, repoName: p.projectName, repoUrl: p.projectUrl });
            }
          }
          if (all.length > 0) {
            apiLibData = all;
            hide('apiLibProgress');
            renderApiLib(all);
            // Show summary and tab bar for cached data
            var repoSet2 = new Set(all.map(function(e) { return e.repoName; }));
            var buSet2 = new Set();
            all.forEach(function(e) { (e.backendUrls || []).forEach(function(b) { buSet2.add(b.url); }); });
            var ctrlSet2 = new Set(all.map(function(e) { return e.controllerClass; }));
            $('apiLibSummary').style.display = '';
            $('apiLibSummary').innerHTML = '<div class="summary-card sc-items"><div class="sc-value">' + all.length + '</div><div class="sc-label">Endpoints</div></div><div class="summary-card sc-projects"><div class="sc-value">' + repoSet2.size + '</div><div class="sc-label">Repos</div></div><div class="summary-card sc-added"><div class="sc-value">' + buSet2.size + '</div><div class="sc-label">Backend URLs</div></div><div class="summary-card sc-net"><div class="sc-value">' + ctrlSet2.size + '</div><div class="sc-label">Controllers</div></div>';
            $('apiLibTabBar').style.display = '';
            var firstTab = document.querySelector('#apiLibTabBar .tab-btn');
            if (firstTab) firstTab.click();
            setStatus(all.length + ' endpoints (cached)');
            return;
          }
        }
      }
    } catch {}
  }

  let projects = (!forceRefresh && cachedDash && cachedDash.rawProjects) ? cachedDash.rawProjects : null;
  if (!projects || projects.length === 0) {
    $('apiLibProgressText').textContent = 'Fetching projects from GitLab...';
    projects = await fetchApiLibProjects(baseUrl, token);
    if (!projects || projects.length === 0) {
      setStatus('No projects found. Enter GitLab URL and token in sidebar.', true);
      hide('apiLibProgress');
      return;
    }
  }

  if (apiLibAbortController) apiLibAbortController.abort();
  apiLibAbortController = new AbortController();
  const signal = apiLibAbortController.signal;

  setStatus('Scanning...');
  const allEndpoints = [];
  const fsProjects = [];
  let ctrlCount = 0;
  var allUnlinkedUrls = [];

  // Scan projects concurrently (up to CONCURRENT_PROJECTS at a time)
  const CONCURRENT_PROJECTS = 3;
  let completedProjects = 0;
  for (let pi = 0; pi < projects.length; pi += CONCURRENT_PROJECTS) {
    if (signal.aborted) { setStatus('Cancelled'); hide('apiLibProgress'); return; }
    const batch = projects.slice(pi, pi + CONCURRENT_PROJECTS);
    var batchResults = await Promise.all(batch.map(async function(proj) {
      if (signal.aborted) return null;
      try {
        return { proj, result: await scanProjectControllers(baseUrl, token, proj, signal) };
      } catch (err) {
        if (err.message === 'Cancelled') throw err;
        return null;
      }
    }));
    for (var bri = 0; bri < batchResults.length; bri++) {
      if (signal.aborted) { setStatus('Cancelled'); hide('apiLibProgress'); return; }
      var br = batchResults[bri];
      if (!br) continue;
      var proj = br.proj;
      var r = br.result;
      var pn = proj.name || proj.path_with_namespace || 'Project ' + proj.id;
      completedProjects++;
      $('apiLibProgressText').textContent = '[' + completedProjects + '/' + projects.length + '] ' + pn + '...';
      $('apiLibProgressBar').style.width = Math.round((completedProjects / projects.length) * 100) + '%';
      await new Promise(function(res) { return setTimeout(res, 0); });
      if (r.endpoints.length > 0) {
        for (const ep of r.endpoints) {
          ep.repoName = pn;
          ep.repoUrl = proj.web_url || (baseUrl.replace(/\/api\/v4\/?$/, '') + '/' + (proj.path_with_namespace || pn));
          allEndpoints.push(ep);
        }
        fsProjects.push({ id: proj.id, name: pn, webUrl: proj.web_url || '', endpoints: r.endpoints });
        ctrlCount += r.controllerCount;
      }
      if (r.unlinkedUrls && r.unlinkedUrls.length > 0) {
        r.unlinkedUrls.forEach(function(u) { u.repoName = pn; u.repoUrl = proj.web_url || ''; });
        allUnlinkedUrls = allUnlinkedUrls.concat(r.unlinkedUrls);
      }
    }
  }

  hide('apiLibProgress');
  if (allEndpoints.length === 0) { show('apiLibEmpty'); setStatus('No controller endpoints found'); return; }

  apiLibData = allEndpoints;
  apiLibUnlinkedUrls = allUnlinkedUrls;
  renderApiLib(allEndpoints);

  // Save to Firestore cache
  if (fsProjects.length > 0) {
    try {
      const fnUrl = getFnUrl();
      await fetch(fnUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokenHash: hashToken(token), baseUrl, projects: fsProjects }) });
    } catch {}
  }

  const repoSet = new Set(allEndpoints.map(e => e.repoName));
  const buSet = new Set();
  allEndpoints.forEach(e => (e.backendUrls || []).forEach(b => buSet.add(b.url)));
  $('apiLibSummary').style.display = '';
  $('apiLibSummary').innerHTML = `
    <div class="summary-card sc-items"><div class="sc-value">${allEndpoints.length}</div><div class="sc-label">Endpoints</div></div>
    <div class="summary-card sc-projects"><div class="sc-value">${repoSet.size}</div><div class="sc-label">Repos</div></div>
    <div class="summary-card sc-added"><div class="sc-value">${buSet.size}</div><div class="sc-label">Backend URLs</div></div>
    <div class="summary-card sc-net"><div class="sc-value">${ctrlCount}</div><div class="sc-label">Controllers</div></div>`;
  $('apiLibTabBar').style.display = '';
  // Activate first tab
  var firstTab = document.querySelector('#apiLibTabBar .tab-btn');
  if (firstTab) firstTab.click();
  setStatus(`${allEndpoints.length} endpoints, ${repoSet.size} repos`);
}

// ─── Per-project controller scan ─────────────────────────
async function scanProjectControllers(baseUrl, token, proj, signal) {
  const branch = await findLatestBranch(baseUrl, token, proj.id, signal);
  if (!branch) return { endpoints: [], controllerCount: 0 };

  const urlProps = await findUrlProperties(baseUrl, token, proj.id, branch, signal);
  const ctrlFiles = await findControllerFiles(baseUrl, token, proj.id, branch, signal);
  if (ctrlFiles.length === 0) return { endpoints: [], controllerCount: 0 };

  // Backward chain: search ALL Java files (not just controllers) for each URL key usage
  // Map: key → { url, propFile, key, usageFiles: [filename, ...] }
  const urlKeyUsage = {};
  for (const up of urlProps) {
    urlKeyUsage[up.key] = { url: up.url, key: up.key, propFile: up.propFile, usageFiles: [] };
  }

  const keysToTrace = Object.keys(urlKeyUsage);
  // Batch URL key searches concurrently (single-page each, no paginate needed)
  var searchKeyUsage = async function(sk) {
    if (signal.aborted) throw new Error('Cancelled');
    try {
      const r2 = await apiFetch(baseUrl, '/projects/' + proj.id + '/search', { scope: 'blobs', search: '${' + sk + '}', ref: branch, per_page: 100 }, token, signal);
      const d2 = await r2.json();
      if (Array.isArray(d2)) {
        d2.forEach(function(x) {
          if (x.filename && x.data) {
            var lines2 = (x.data || '').split('\n');
            if (lines2.some(function(l) { return l.includes('${' + sk + '}') || l.includes("${" + sk + "}"); })) {
              urlKeyUsage[sk].usageFiles.push(x.filename);
            }
          }
        });
      }
    } catch {}
  };
  const CONCURRENT_SEARCHES = 8;
  for (var ski = 0; ski < keysToTrace.length; ski += CONCURRENT_SEARCHES) {
    if (signal.aborted) throw new Error('Cancelled');
    await Promise.all(keysToTrace.slice(ski, ski + CONCURRENT_SEARCHES).map(searchKeyUsage));
  }

  // Build global @Value key→fieldName map from project-wide Java files
  // (catches PropertyUtil/config beans where @Value lives, not the controller)
  const globalValueProps = {};
  try {
    const valResults = await paginate(baseUrl, `/projects/${projId}/search`, { scope: 'blobs', search: '@Value', per_page: 100 }, token, signal);
    if (Array.isArray(valResults)) {
      for (var vi2 = 0; vi2 < valResults.length; vi2++) {
        var vr = valResults[vi2];
        if (!vr.filename || !vr.filename.endsWith('.java') || !vr.data) continue;
        if (vr.data.indexOf('${') < 0) continue;
        var gvRe = /@Value\s*\(\s*["']\$\{([^}]+)\}["']\s*\)([^;=]*?)(\w+)\s*(?:;|=)/g;
        var gvm;
        while ((gvm = gvRe.exec(vr.data)) !== null) {
          if (!globalValueProps[gvm[1]]) globalValueProps[gvm[1]] = gvm[3];
        }
      }
    }
  } catch {}

  // Per-project caches to avoid duplicate API calls
  const fileCache = {};
  async function cachedGetFileContent(fp) {
    if (!fileCache[fp]) fileCache[fp] = getFileContent(baseUrl, token, proj.id, fp, branch, signal);
    return fileCache[fp];
  }
  const svcImplCache = {};
  async function cachedFindServiceImplFiles(typeName) {
    if (!svcImplCache[typeName]) svcImplCache[typeName] = findServiceImplFiles(baseUrl, token, proj.id, typeName, branch, signal);
    return svcImplCache[typeName];
  }

  const endpoints = [];
  const usedUrlKeys = {};
  const unusedUrlKeys = {};

  for (const cf of ctrlFiles) {
    if (signal.aborted) throw new Error('Cancelled');
    try {
      const content = await cachedGetFileContent(cf);
      const parsed = parseControllerFile(content, cf);
      if (parsed.endpoints.length === 0 && !parsed.className) continue;

      // For each endpoint, find which backend URLs it directly or indirectly consumes
      for (const ep of parsed.endpoints) {
        // Direct matches: @Value field names found in this endpoint's method body
        const directUrls = [];
        const matchedRefs = [];
        const directKeys = ep.matchedKeys || [];
        directKeys.forEach(function(k) {
          const u = urlKeyUsage[k];
          if (u && u.usageFiles.indexOf(cf) >= 0) {
            directUrls.push({ url: u.url, key: u.key, propFile: u.propFile || '' });
            // Reference tracking
            var lines = content.split('\n');
            var li = lines.findIndex(function(l) { return l.includes('${' + k + '}'); });
            if (li >= 0) {
              var s = lines.slice(Math.max(0, li - 1), li + 2).join('\n').trim();
              matchedRefs.push({ file: cf, line: li + 1, snippet: s || k });
            }
          }
        });

        // Getter-based matching: check for .getXxx() calls in endpoint region
        // that correspond to @Value field names (e.g., config.getSomeUrl() -> someUrl)
        // Uses both the controller's own @Value (parsed.valueProps) and project-wide
        // @Value map (globalValueProps) to handle PropertyUtil/config beans
        if (directUrls.length === 0 && ep.regionText) {
          var getterSrc = (parsed.valueProps || []).map(function(p) { return p; });
          // Merge in global valueProps entries not already in parsed.valueProps
          if (Object.keys(globalValueProps).length > 0) {
            var seenKeys = {};
            getterSrc.forEach(function(p) { seenKeys[p.key] = true; });
            for (var gkName in globalValueProps) {
              if (!seenKeys[gkName]) getterSrc.push({ key: gkName, fieldName: globalValueProps[gkName] });
            }
          }
          for (var gi = 0; gi < keysToTrace.length; gi++) {
            var gk = keysToTrace[gi];
            var gu = urlKeyUsage[gk];
            if (!gu) continue;
            for (var gvi = 0; gvi < getterSrc.length; gvi++) {
              var gvp = getterSrc[gvi];
              if (gvp.key === gk && gvp.fieldName) {
                var getterPatt = '.get' + gvp.fieldName.charAt(0).toUpperCase() + gvp.fieldName.slice(1) + '(';
                if (ep.regionText.indexOf(getterPatt) >= 0) {
                  directUrls.push({ url: gu.url, key: gu.key, propFile: gu.propFile || '' });
                  var glines = content.split('\n');
                  var gli = glines.findIndex(function(l) { return l.includes(getterPatt); });
                  if (gli >= 0) {
                    var gs = glines.slice(Math.max(0, gli - 1), gli + 2).join('\n').trim();
                    matchedRefs.push({ file: cf, line: gli + 1, snippet: gs || getterPatt });
                  }
                }
              }
            }
          }
        }

        // Indirect matches: check autowired services called by this endpoint
        // If an autowired fieldName appears in the endpoint region,
        // find URL keys used in that service's implementation files
        var indirectUrls = [];
        if (ep.matchedAutowiredFieldNames && ep.matchedAutowiredFieldNames.length > 0) {
          var autoFieldsInUse = ep.matchedAutowiredFieldNames;
          for (var ai = 0; ai < autoFieldsInUse.length; ai++) {
            var fld = autoFieldsInUse[ai];
            // Find the type for this fieldName
            var autoType = null;
            for (var ati = 0; ati < parsed.autowiredTypes.length; ati++) {
              if (parsed.autowiredTypes[ati].fieldName === fld) {
                autoType = parsed.autowiredTypes[ati].type;
                break;
              }
            }
            if (!autoType) continue;
            if (signal.aborted) throw new Error('Cancelled');
            try {
              var impls = await cachedFindServiceImplFiles(autoType);
              var svcFiles = impls;
              // Check each URL key for usage in these service files
              for (var ki = 0; ki < keysToTrace.length; ki++) {
                var k2 = keysToTrace[ki];
                var u2 = urlKeyUsage[k2];
                if (!u2 || u2.usageFiles.length === 0) continue;
                var usedInSvc = svcFiles.some(function(sf) { return u2.usageFiles.indexOf(sf) >= 0; });
                if (usedInSvc) {
                  indirectUrls.push({ url: u2.url, key: u2.key, propFile: u2.propFile || '' });
                }
              }
            } catch {}
          }
        }

        // Deep indirect tracing: check if autowired services themselves autowire
        // config beans that have @Value URL references (2-level chaining)
        if (indirectUrls.length === 0 && ep.matchedAutowiredFieldNames && ep.matchedAutowiredFieldNames.length > 0) {
          for (var dai = 0; dai < ep.matchedAutowiredFieldNames.length; dai++) {
            var dfld = ep.matchedAutowiredFieldNames[dai];
            var dAutoType = null;
            for (var dati = 0; dati < parsed.autowiredTypes.length; dati++) {
              if (parsed.autowiredTypes[dati].fieldName === dfld) {
                dAutoType = parsed.autowiredTypes[dati].type;
                break;
              }
            }
            if (!dAutoType) continue;
            if (signal.aborted) throw new Error('Cancelled');
            try {
              var dimpls = await cachedFindServiceImplFiles(dAutoType);
              for (var di = 0; di < dimpls.length; di++) {
                var svcContent = await cachedGetFileContent(dimpls[di]);
                var svcClean = svcContent.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
                // Find @Autowired fields in this service file (config beans)
                var deepAutoRe = /@Autowired[^;]*?(?:private\s+)?(\w+)(?:<([^>]+)>)?\s+(\w+)\s*;/g;
                var dam;
                while ((dam = deepAutoRe.exec(svcClean)) !== null) {
                  var dDeepType = dam[2] || dam[1];
                  if (!dDeepType || dDeepType === 'Autowired' || dDeepType.startsWith('@')) continue;
                  var configImpls = await cachedFindServiceImplFiles(dDeepType);

                  // Parse config bean implementations for their own @Value annotations
                  // to get correct key→fieldName mapping for getter matching
                  var configValueProps = [];
                  for (var cvi = 0; cvi < configImpls.length; cvi++) {
                    try {
                      var cvContent = await cachedGetFileContent(configImpls[cvi]);
                      var cvClean = cvContent.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
                      var cvfRe = /@Value\s*\(\s*["']\$\{([^}]+)\}["']\s*\)([^;=]*?)(\w+)\s*(?:;|=)/g;
                      var cvf;
                      while ((cvf = cvfRe.exec(cvClean)) !== null) {
                        configValueProps.push({ key: cvf[1], fieldName: cvf[3] });
                      }
                    } catch {}
                  }

                  for (var ki2 = 0; ki2 < keysToTrace.length; ki2++) {
                    var k3 = keysToTrace[ki2];
                    var u3 = urlKeyUsage[k3];
                    if (!u3 || u3.usageFiles.length === 0) continue;
                    var usedInConfig = configImpls.some(function(cfi) { return u3.usageFiles.indexOf(cfi) >= 0; });
                    if (usedInConfig) {
                      indirectUrls.push({ url: u3.url, key: u3.key, propFile: u3.propFile || '' });
                    }
                  }

                  // Check for getter method calls in the service file matching URL key field names.
                  // Use configValueProps (from the config bean's own @Value annotations) instead of
                  // controller's valueProps — the config bean is where @Value lives, not the controller.
                  var getterValueProps = configValueProps.length > 0 ? configValueProps : [];
                  if (getterValueProps.length === 0 && parsed.valueProps && parsed.valueProps.length > 0) getterValueProps = parsed.valueProps;
                  if (getterValueProps.length === 0) {
                    var gkNames = Object.keys(globalValueProps);
                    if (gkNames.length > 0) getterValueProps = gkNames.map(function(gk) { return { key: gk, fieldName: globalValueProps[gk] }; });
                  }
                  for (var ki3 = 0; ki3 < keysToTrace.length; ki3++) {
                    var k4 = keysToTrace[ki3];
                    var u4 = urlKeyUsage[k4];
                    if (!u4) continue;
                    for (var gvi = 0; gvi < getterValueProps.length; gvi++) {
                      var gvp = getterValueProps[gvi];
                      if (gvp.key === k4 && gvp.fieldName) {
                        var getterPattern = '.get' + gvp.fieldName.charAt(0).toUpperCase() + gvp.fieldName.slice(1) + '(';
                        if (svcContent.indexOf(getterPattern) >= 0) {
                          indirectUrls.push({ url: u4.url, key: u4.key, propFile: u4.propFile || '' });
                        }
                      }
                    }
                  }
                }
              }
            } catch {}
          }
        }

        var allUrls = directUrls.length > 0 ? directUrls : indirectUrls;

        // Method-level fallback: check if ${key} appears directly in this endpoint's region text
        // (more precise than file-level matching)
        if (allUrls.length === 0 && ep.regionText) {
          for (var fi = 0; fi < keysToTrace.length; fi++) {
            var fk = keysToTrace[fi];
            var fu = urlKeyUsage[fk];
            if (fu && ep.regionText.indexOf('${' + fk + '}') >= 0) {
              allUrls.push({ url: fu.url, key: fu.key, propFile: fu.propFile || '' });
            }
          }
        }

        // Collect unique propFile paths for file column
        var propFilesSet = {};
        allUrls.forEach(function(b) { if (b.propFile) propFilesSet[b.propFile] = true; });
        var propFiles = Object.keys(propFilesSet);
        var fileDisplay = propFiles.length > 0 ? propFiles.sort().join(', ') : cf;

        allUrls.forEach(function(bu) { usedUrlKeys[bu.key] = true; });

        endpoints.push({
          endpoint: ep.method + ' ' + parsed.basePath + ep.path,
          httpMethod: ep.method,
          controllerClass: parsed.className,
          backendUrls: allUrls,
          file: fileDisplay,
          refs: matchedRefs.length > 0 ? matchedRefs : parsed.valueRefs,
        });
      }
    } catch {}
  }

  for (var uk in urlKeyUsage) {
    if (!usedUrlKeys[uk]) {
      unusedUrlKeys[uk] = urlKeyUsage[uk];
    }
  }
  var unlinkedList = [];
  for (var uk in unusedUrlKeys) {
    unlinkedList.push({ key: unusedUrlKeys[uk].key, url: unusedUrlKeys[uk].url, propFile: unusedUrlKeys[uk].propFile || '', usageCount: unusedUrlKeys[uk].usageFiles.length });
  }

  return { endpoints, controllerCount: ctrlFiles.length, unlinkedUrls: unlinkedList };
}

// ─── Reused helpers ──────────────────────────────────────
async function findLatestBranch(baseUrl, token, projId, signal) {
  try {
    const branches = await paginate(baseUrl, `/projects/${projId}/repository/branches`, { per_page: 100 }, token, signal);
    if (branches.length === 0) return null;
    branches.sort((a, b) => new Date(b.commit.committed_date) - new Date(a.commit.committed_date));
    return branches[0].name;
  } catch {
    try {
      const r = await apiFetch(baseUrl, `/projects/${projId}`, {}, token, signal);
      const d = await r.json();
      return d.default_branch || 'main';
    } catch { return null; }
  }
}

async function findPropertyFiles(baseUrl, token, projId, ref, signal) {
  const items = await paginate(baseUrl, `/projects/${projId}/repository/tree`, { recursive: true, per_page: 100, ref }, token, signal);
  const exts = ['.properties', '.yml', '.yaml'];
  return items.filter(i => i.type === 'blob' && exts.some(e => i.name.endsWith(e))).map(i => i.path);
}

async function getFileContent(baseUrl, token, projId, fp, ref, signal) {
  const enc = encodeURIComponent(fp);
  const r = await apiFetch(baseUrl, `/projects/${projId}/repository/files/${enc}/raw`, { ref }, token, signal);
  return await r.text();
}

async function findUrlProperties(baseUrl, token, projId, branch, signal) {
  const files = await findPropertyFiles(baseUrl, token, projId, branch, signal);
  const out = [];
  for (const f of files) {
    if (signal.aborted) throw new Error('Cancelled');
    try { out.push(...parseUrlProperties(await getFileContent(baseUrl, token, projId, f, branch, signal), f)); } catch {}
  }
  return out;
}

function parseUrlProperties(content, filePath) {
  const out = [];
  const ext = filePath.split('.').pop().toLowerCase();
  if (ext === 'properties') {
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#') || t.startsWith('!')) continue;
      const m = t.match(/^([\w.-]+)\s*[=:]\s*(https?:\/\/\S+)/);
      if (m) out.push({ key: m[1], url: m[2].replace(/["']/g, ''), propFile: filePath });
    }
  } else if (ext === 'yml' || ext === 'yaml') {
    const lines = content.split('\n'); const path = []; let pd = -1;
    for (const line of lines) {
      const t = line.trimEnd(); if (!t || t.trim().startsWith('#')) continue;
      const d = Math.round((t.length - t.trimStart().length) / 2);
      const s = t.trim(); const ci = s.indexOf(':'); if (ci < 0) continue;
      const k = s.slice(0, ci).trim(); const v = s.slice(ci + 1).trim();
      if (v === '' || v === '|' || v === '>') {
        if (d > pd) path.push(k);
        else if (d === pd) { if (path.length) path[path.length - 1] = k; }
        else { for (let j = pd - d; j > 0 && path.length; j--) path.pop(); path.push(k); }
      } else if (v.startsWith('http://') || v.startsWith('https://')) {
        if (d < pd) for (let j = pd - d; j > 0 && path.length; j--) path.pop();
        if (d === pd && path.length) path[path.length - 1] = k;
        out.push({ key: [...path, k].join('.'), url: v.replace(/["']/g, ''), propFile: filePath });
      }
      pd = d;
    }
  }
  return out;
}

async function findControllerFiles(baseUrl, token, projId, branch, signal) {
  const files = new Set();
  // Paginated search for @RestController files
  try {
    const results = await paginate(baseUrl, `/projects/${projId}/search`, { scope: 'blobs', search: '@RestController' }, token, signal);
    if (Array.isArray(results)) results.forEach(x => { if (x.filename && x.filename.endsWith('.java')) files.add(x.filename); });
  } catch {}
  // Paginated search for @Controller files (excluding tests)
  try {
    const results = await paginate(baseUrl, `/projects/${projId}/search`, { scope: 'blobs', search: '@Controller' }, token, signal);
    if (Array.isArray(results)) results.forEach(x => { if (x.filename && x.filename.endsWith('.java') && !x.filename.endsWith('Test.java')) files.add(x.filename); });
  } catch {}
  // Fallback: use repository tree to find ALL Java files with "Controller" in path
  // (catches files the search API may have missed due to indexing limits)
  try {
    const tree = await paginate(baseUrl, `/projects/${projId}/repository/tree`, { recursive: true, per_page: 100, ref: branch }, token, signal);
    if (Array.isArray(tree)) {
      tree.forEach(function(item) {
        if (item.type === 'blob' && item.path.endsWith('.java') &&
            (item.path.includes('Controller') || item.path.includes('controller')) &&
            !item.path.endsWith('Test.java')) {
          files.add(item.path);
        }
      });
    }
  } catch {}
  return [...files];
}

function parseControllerFile(content, filePath) {
  var r = { className: '', basePath: '', endpoints: [], autowiredTypes: [], valueProps: [], valueRefs: [] };

  // Safer comment stripping: block comments first, then line comments at line start only
  var clean = content.replace(/\/\*[\s\S]*?\*\//g, '');
  clean = clean.replace(/^[ \t]*\/\/.*$/gm, '');

  // Class name
  var cm = clean.match(/(?:public\s+)?class\s+(\w+)/);
  if (cm) r.className = cm[1];

  // Class-level @RequestMapping base path
  var rm = clean.match(/@RequestMapping\s*\([^)]*\)/);
  if (rm) {
    var bm = rm[0].match(/(?:value|path)\s*=\s*["']([^"']+)["']/);
    if (bm) r.basePath = bm[1];
  }

  // Parse @Value("${key}") ... fieldName → key + fieldName (handles generic types)
  // Match the last word before ; or = as the field name — works for all type patterns
  var valueFieldRe = /@Value\s*\(\s*["']\$\{([^}]+)\}["']\s*\)([^;=]*?)(\w+)\s*(?:;|=)/g;
  var vf;
  while ((vf = valueFieldRe.exec(clean)) !== null) {
    r.valueProps.push({ key: vf[1], fieldName: vf[3] });
    var ln2 = content.slice(0, vf.index).split('\n').length;
    var ls2 = content.lastIndexOf('\n', vf.index) + 1;
    var le2 = content.indexOf('\n', vf.index);
    r.valueRefs.push({ file: filePath, line: ln2, snippet: content.slice(ls2, le2 > 0 ? le2 : content.length).trim() });
  }

  // Plain ${key} extraction (no field name) — used as fallback for per-endpoint matching
  var vp = /\$\{([^}:]+)(?::[^}]*)?\}/g;
  var vm;
  while ((vm = vp.exec(clean)) !== null) {
    // Only add if not already captured by field-name regex
    var already = r.valueProps.some(function(p) { return p.key === vm[1]; });
    if (!already) {
      r.valueProps.push({ key: vm[1], fieldName: '' });
      var ln3 = content.slice(0, vm.index).split('\n').length;
      var ls3 = content.lastIndexOf('\n', vm.index) + 1;
      var le3 = content.indexOf('\n', vm.index);
      r.valueRefs.push({ file: filePath, line: ln3, snippet: content.slice(ls3, le3 > 0 ? le3 : content.length).trim() });
    }
  }

  // Build key→fieldName map
  var keyToField = {};
  r.valueProps.forEach(function(v) { if (v.fieldName) keyToField[v.key] = v.fieldName; });

  // Parse @Autowired private Type fieldName — handles generics like List<UserService>
  var autoRe = /@Autowired[^;]*?(?:private\s+)?(\w+)(?:<([^>]+)>)?\s+(\w+)\s*;/g;
  var am;
  while ((am = autoRe.exec(clean)) !== null) {
    var typeName = am[2] || am[1];
    if (typeName && typeName !== 'Autowired' && !typeName.startsWith('@')) {
      r.autowiredTypes.push({ type: typeName, fieldName: am[3] });
    }
  }

  // Collect all endpoint annotations with their positions in `clean`
  var annotations = [];

  // Pattern 1: @GetMapping, @PostMapping, @PutMapping, @DeleteMapping, @PatchMapping
  var shortRe = /@(Get|Post|Put|Delete|Patch)Mapping\s*(?:\(([^)]*)\))?/g;
  var sm;
  while ((sm = shortRe.exec(clean)) !== null) {
    var method1 = sm[1].toUpperCase();
    var args1 = (sm[2] || '').trim();
    var path1 = '';
    if (args1) {
      var pv1 = args1.match(/(?:path|value)\s*=\s*\{?\s*["']([^"']+)["']/);
      if (pv1) { path1 = pv1[1]; } else {
        var q1 = args1.match(/^["']([^"']*)["']/);
        if (q1) path1 = q1[1];
      }
    }
    annotations.push({ method: method1, path: path1, pos: sm.index });
  }

  // Pattern 2: @RequestMapping(method = RequestMethod.GET|POST|...) at method level
  var reqMapRe = /@RequestMapping\s*\(([^)]*)\)/g;
  var rmm;
  while ((rmm = reqMapRe.exec(clean)) !== null) {
    var args2 = rmm[1];
    var methodM = args2.match(/method\s*=\s*(?:RequestMethod\.)?(\w+)/);
    if (methodM) {
      var method2 = methodM[1].toUpperCase();
      var valM2 = args2.match(/(?:value|path)\s*=\s*["']([^"']+)["']/);
      var path2 = valM2 ? valM2[1] : '';
      annotations.push({ method: method2, path: path2, pos: rmm.index });
    }
  }

  // Sort by position in file
  annotations.sort(function(a, b) { return a.pos - b.pos; });

  // Build endpoints with per-method matched keys
  for (var i = 0; i < annotations.length; i++) {
    var a = annotations[i];
    var ep = { method: a.method, path: a.path, matchedKeys: [], regionText: regionText };

    // Determine region text for this endpoint: from this annotation to next one or EOF
    var regionStart = a.pos;
    var regionEnd = i + 1 < annotations.length ? annotations[i + 1].pos : clean.length;
    var regionText = clean.slice(regionStart, regionEnd);

    // Check which @Value field names appear in this method region
    if (Object.keys(keyToField).length > 0) {
      r.valueProps.forEach(function(v) {
        if (!v.fieldName) return;
        var declLineEnd = regionText.indexOf(';') + 1;
        var bodyText = declLineEnd > 0 ? regionText.slice(declLineEnd) : regionText;
        var idx = bodyText.indexOf(v.fieldName);
        if (idx >= 0) {
          var chBefore = idx > 0 ? bodyText[idx - 1] : ' ';
          var chAfter = idx + v.fieldName.length < bodyText.length ? bodyText[idx + v.fieldName.length] : ' ';
          if (/[\W_]/.test(chBefore) && /[\W_]/.test(chAfter)) {
            ep.matchedKeys.push(v.key);
          }
        }
      });
    }

    // Fallback: match plain ${key} in region text (for keys without extracted field names)
    if (r.valueProps.length > 0) {
      r.valueProps.forEach(function(v) {
        if (v.fieldName) return; // already handled above
        var dEnd = regionText.indexOf(';') + 1;
        var bText = dEnd > 0 ? regionText.slice(dEnd) : regionText;
        if (bText.indexOf('${' + v.key + '}') >= 0) {
          ep.matchedKeys.push(v.key);
        }
      });
    }

    // Check which autowired field names appear in this method region
    ep.matchedAutowiredFieldNames = [];
    if (r.autowiredTypes.length > 0) {
      var declEnd = regionText.indexOf(';') + 1;
      var bodyOnly = declEnd > 0 ? regionText.slice(declEnd) : regionText;
      r.autowiredTypes.forEach(function(at) {
        if (!at.fieldName) return;
        var ai = bodyOnly.indexOf(at.fieldName);
        if (ai >= 0) {
          var cb = ai > 0 ? bodyOnly[ai - 1] : ' ';
          var ca = ai + at.fieldName.length < bodyOnly.length ? bodyOnly[ai + at.fieldName.length] : ' ';
          if (/[\W_]/.test(cb) && /[\W_]/.test(ca)) {
            ep.matchedAutowiredFieldNames.push(at.fieldName);
          }
        }
      });
    }

    r.endpoints.push(ep);
  }

  return r;
}

function extractValueProps(content) {
  const out = []; const vp = /\$\{([^}:]+)(?::[^}]*)?\}/g; let m;
  while ((m = vp.exec(content)) !== null) out.push({ key: m[1] });
  return out;
}

async function findServiceImplFiles(baseUrl, token, projId, typeName, branch, signal) {
  const results = new Set();
  try {
    const r = await apiFetch(baseUrl, `/projects/${projId}/search`, { scope: 'blobs', search: typeName, per_page: 100 }, token, signal);
    const d = await r.json();
    if (Array.isArray(d)) d.forEach(x => {
      if (x.filename && x.filename.endsWith('.java') && x.data && (x.data.includes('class ') || x.data.includes('@Service') || x.data.includes('implements'))) results.add(x.filename);
    });
  } catch {}
  return [...results];
}

// ─── Render table (no nested backticks) ──────────────────
function renderApiLib(data) {
  const q = $('apiLibSearch').value.trim().toLowerCase();
  const hasUrlFilter = $('apiLibHasUrlToggle').checked;
  let filtered = data;
  if (hasUrlFilter) {
    filtered = filtered.filter(function(e) { return e.backendUrls && e.backendUrls.length > 0; });
  }
  const f = q ? filtered.filter(function(e) {
    return e.endpoint.toLowerCase().includes(q) || e.repoName.toLowerCase().includes(q) ||
      e.repoUrl.toLowerCase().includes(q) || e.file.toLowerCase().includes(q) ||
      (e.controllerClass || '').toLowerCase().includes(q) ||
      (e.backendUrls || []).some(function(b) { return (b.propFile || '').toLowerCase().includes(q) || b.url.toLowerCase().includes(q) || b.key.toLowerCase().includes(q); });
  }) : filtered;
  const wrap = $('apiLibTableWrap');
  hide('apiLibEmpty'); show('apiLibResults');
  if (f.length === 0) { wrap.innerHTML = '<div class="chart-empty">No results matching "' + escHtml(q) + '"</div>'; return; }

  var html = '<table><thead><tr><th style="width:2rem">#</th><th>API</th><th>Repo URL</th><th>Repo</th><th>Backend URL(s)</th><th>File</th><th style="width:4rem">Refs</th></tr></thead><tbody>';

  for (var i = 0; i < f.length; i++) {
    var e = f[i];
    var buHtml = '';
    if ((e.backendUrls || []).length > 0) {
      for (var j = 0; j < e.backendUrls.length; j++) {
        var b = e.backendUrls[j];
        buHtml += '<div style="margin:0.15rem 0;word-break:break-all"><span style="color:var(--text-muted)">' + escHtml(b.key) + '</span>: <span style="color:var(--secondary)">' + escHtml(b.url.length > 40 ? b.url.slice(0, 38) + '\u2026' : b.url) + '</span></div>';
      }
    } else {
      buHtml = '<span style="color:var(--text-muted)">\u2014</span>';
    }

    var refBadge = (e.refs || []).length > 0
      ? '<span class="api-lib-ref-badge">' + e.refs.length + '</span>'
      : '<span style="color:var(--text-muted);font-size:0.7rem">\u2014</span>';

    var repoDisplay = (e.repoUrl || '').replace(/^https?:\/\//, '');
    if (repoDisplay.length > 35) repoDisplay = repoDisplay.slice(0, 35);

    // Show property file path(s) in File column
    var fileParts = (e.file || '').split(', ');
    var fileDisplay = '';
    if (fileParts.length === 1) {
      fileDisplay = escHtml(fileParts[0].split('/').pop() || fileParts[0]);
    } else if (fileParts.length > 1) {
      fileDisplay = escHtml(fileParts[0].split('/').pop() || fileParts[0]) + ' +' + (fileParts.length - 1);
    } else {
      fileDisplay = escHtml((e.file || '').split('/').pop());
    }

    html += '<tr class="api-lib-row" data-idx="' + i + '" style="cursor:pointer">'
      + '<td>' + (i + 1) + '</td>'
      + '<td style="font-size:0.75rem"><code style="color:var(--primary)">' + escHtml(e.httpMethod || '') + '</code> <span>' + escHtml(e.endpoint) + '</span></td>'
      + '<td style="font-size:0.7rem"><a href="' + escHtml(e.repoUrl) + '" target="_blank" style="color:var(--secondary);text-decoration:none" onclick="event.stopPropagation()">' + escHtml(repoDisplay) + '\u2026</a></td>'
      + '<td style="font-size:0.75rem">' + escHtml(e.repoName) + '</td>'
      + '<td style="font-size:0.7rem;max-width:200px">' + buHtml + '</td>'
      + '<td style="font-size:0.7rem;color:var(--text-muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escHtml(e.file) + '">' + fileDisplay + '</td>'
      + '<td style="text-align:center">' + refBadge + '</td></tr>';

    var detailHtml = '';
    if ((e.backendUrls || []).length > 0) {
      detailHtml += '<div style="font-size:0.7rem;font-weight:700;color:var(--text-muted);margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.04em">Backend URLs consumed:</div>';
      for (var j = 0; j < e.backendUrls.length; j++) {
        var b = e.backendUrls[j];
        var propInfo = b.propFile ? ' <span style="font-size:0.65rem;color:var(--text-muted)">(' + escHtml(b.propFile.split('/').pop()) + ')</span>' : '';
        detailHtml += '<div class="api-lib-usage" style="margin-bottom:0.35rem;padding:0.4rem 0.6rem"><code style="font-size:0.72rem;color:var(--text)">' + escHtml(b.key) + '</code>' + propInfo + '<br><span style="font-size:0.72rem;color:var(--secondary);word-break:break-all">' + escHtml(b.url) + '</span></div>';
      }
      // Backend URL source tree
      var sourceTreeHtml = buildBackendUrlSourceTree(e.backendUrls);
      if (sourceTreeHtml) {
        detailHtml += '<div style="font-size:0.7rem;font-weight:700;color:var(--text-muted);margin:0.75rem 0 0.5rem;text-transform:uppercase;letter-spacing:0.04em">Backend URL Source Tree:</div>'
          + '<div class="api-lib-source-tree">' + sourceTreeHtml + '</div>';
      }
    }
    if ((e.refs || []).length > 0) {
      detailHtml += '<div style="font-size:0.7rem;font-weight:700;color:var(--text-muted);margin:0.75rem 0 0.5rem;text-transform:uppercase;letter-spacing:0.04em">References (' + e.refs.length + '):</div>';
      for (var j = 0; j < e.refs.length; j++) {
        var u = e.refs[j];
        detailHtml += '<div class="api-lib-usage"><code style="font-size:0.72rem;color:var(--text)">' + escHtml(u.file) + ':' + u.line + '</code><pre style="font-size:0.7rem;background:var(--bg-input);padding:0.4rem 0.6rem;border-radius:0.35rem;overflow-x:auto;color:var(--text-muted);margin:0.25rem 0 0;border:1px solid var(--border);max-height:80px;overflow-y:auto"><code>' + escHtml(u.snippet) + '</code></pre></div>';
      }
    }
    html += '<tr class="api-lib-detail-row" data-parent="' + i + '" style="display:none"><td colspan="7" style="padding:0"><div class="api-lib-detail">' + detailHtml + '</div></td></tr>';
  }

  html += '</tbody></table>';
  wrap.innerHTML = html;

  wrap.querySelectorAll('.api-lib-row').forEach(function(row) {
    row.addEventListener('click', function() {
      var idx = row.getAttribute('data-idx');
      var det = wrap.querySelector('.api-lib-detail-row[data-parent="' + idx + '"]');
      var vis = det && det.style.display !== 'none';
      wrap.querySelectorAll('.api-lib-detail-row').forEach(function(r) { r.style.display = 'none'; });
      wrap.querySelectorAll('.api-lib-row').forEach(function(r) { r.classList.remove('api-lib-row--active'); });
      if (det && !vis) { det.style.display = ''; row.classList.add('api-lib-row--active'); }
    });
  });
}

// ─── CSV export ──────────────────────────────────────────
function exportApiLibCsv() {
  if (!apiLibData || apiLibData.length === 0) { setStatus('No data to export', true); return; }
  var rows = [['#', 'HTTP Method', 'Endpoint', 'Controller Class', 'Repo URL', 'Repo Name', 'Backend URL(s)', 'Property File(s)', 'Ref Count']];
  for (var i = 0; i < apiLibData.length; i++) {
    var e = apiLibData[i];
    var bu = (e.backendUrls || []).map(function(b) { return b.key + '=' + b.url; }).join('; ');
    var pf = (e.backendUrls || []).map(function(b) { return b.propFile || ''; }).filter(function(x) { return x; }).join('; ');
    rows.push([i + 1, e.httpMethod || '', e.endpoint, e.controllerClass || '', e.repoUrl || '', e.repoName || '', bu, pf || e.file || '', (e.refs || []).length]);
  }
  var csv = rows.map(function(r) { return r.map(function(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
  var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'api-lib-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  setStatus('Exported ' + apiLibData.length + ' rows');
}

// ─── Render API LIB Overview (endpoints per repo + method distribution) ──
function renderApiLibOverview(data) {
  var repoMap = {};
  var methodMap = {};
  for (var i = 0; i < data.length; i++) {
    var e = data[i];
    var rn = e.repoName || 'unknown';
    if (!repoMap[rn]) repoMap[rn] = 0;
    repoMap[rn]++;
    var m = e.httpMethod || 'UNKNOWN';
    if (!methodMap[m]) methodMap[m] = 0;
    methodMap[m]++;
  }

  // Endpoints per repo
  var repoEntries = Object.entries(repoMap).sort(function(a, b) { return b[1] - a[1]; });
  var repoChart = $('apiLibRepoChart');
  if (repoEntries.length === 0) {
    repoChart.innerHTML = '<div class="chart-empty">No data</div>';
  } else {
    var maxRepo = repoEntries[0][1];
    var rh = '';
    for (var ri = 0; ri < repoEntries.length; ri++) {
      var pct = Math.round((repoEntries[ri][1] / maxRepo) * 100);
      rh += '<div class="api-lib-bar-row">'
        + '<span class="api-lib-bar-label" title="' + escHtml(repoEntries[ri][0]) + '">' + escHtml(repoEntries[ri][0]) + '</span>'
        + '<div class="api-lib-bar-track"><div class="api-lib-bar-fill" style="width:' + pct + '%"></div></div>'
        + '<span class="api-lib-bar-count">' + repoEntries[ri][1] + '</span></div>';
    }
    repoChart.innerHTML = '<div style="width:100%;padding:0.5rem 0">' + rh + '</div>';
  }

  // HTTP Method distribution
  var methodEntries = Object.entries(methodMap).sort(function(a, b) { return b[1] - a[1]; });
  var methodChart = $('apiLibMethodChart');
  if (methodEntries.length === 0) {
    methodChart.innerHTML = '<div class="chart-empty">No data</div>';
  } else {
    var maxMethod = methodEntries[0][1];
    var mh = '';
    var methodColors = { GET: '#60a5fa', POST: '#34d399', PUT: '#fbbf24', DELETE: '#f87171', PATCH: '#a78bfa' };
    for (var mi = 0; mi < methodEntries.length; mi++) {
      var me = methodEntries[mi];
      var pct2 = Math.round((me[1] / maxMethod) * 100);
      var color = methodColors[me[0]] || '#6366f1';
      mh += '<div class="api-lib-method-row">'
        + '<span class="api-lib-method-label" style="color:' + color + '">' + me[0] + '</span>'
        + '<div class="api-lib-method-track"><div class="api-lib-method-fill" style="width:' + pct2 + '%;background:' + color + '"></div></div>'
        + '<span class="api-lib-method-count">' + me[1] + '</span></div>';
    }
    methodChart.innerHTML = '<div style="width:100%;padding:0.5rem 0">' + mh + '</div>';
  }
}

// ─── Render API LIB Unlinked URLs ─────────────────────────
function renderApiLibUnlinked(data) {
  var wrap = $('apiLibUnlinkedWrap');
  if (!apiLibUnlinkedUrls || apiLibUnlinkedUrls.length === 0) {
    wrap.innerHTML = '<div class="chart-empty">No unlinked URLs found. All property file URLs are consumed by controllers.</div>';
    return;
  }
  var html = '<div style="width:100%"><div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.75rem">'
    + 'Found <strong>' + apiLibUnlinkedUrls.length + '</strong> URL(s) defined in property files but not consumed by any controller endpoint.</div>'
    + '<div class="table-wrap" style="max-height:500px"><table class="api-lib-unlinked-table"><thead><tr>'
    + '<th>#</th><th>Property Key</th><th>URL</th><th>Property File</th><th>Repo</th></tr></thead><tbody>';
  for (var ui = 0; ui < apiLibUnlinkedUrls.length; ui++) {
    var u = apiLibUnlinkedUrls[ui];
    html += '<tr><td>' + (ui + 1) + '</td>'
      + '<td><code style="color:var(--primary);font-size:0.72rem">' + escHtml(u.key) + '</code></td>'
      + '<td style="word-break:break-all;color:var(--secondary)">' + escHtml(u.url) + '</td>'
      + '<td style="font-size:0.68rem;color:var(--text-muted)">' + escHtml(u.propFile) + '</td>'
      + '<td style="font-size:0.72rem">' + escHtml(u.repoName || '') + '</td></tr>';
  }
  html += '</tbody></table></div></div>';
  wrap.innerHTML = html;
}

// ─── 3D Dependency Map ────────────────────────────────────
var depmapActive = false;

function showApiLibDepmap() {
  var container = $('depmapContainer');
  var empty = $('depmapEmpty');
  if (!apiLibData || apiLibData.length === 0) {
    empty.style.display = '';
    container.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  container.style.display = '';
  container.innerHTML = '<div class="chart-empty">Loading 3D dependency map...</div>';
  loadThreeJS().then(function() {
    buildApiLibDepmap(container);
  }).catch(function(err) {
    container.innerHTML = '<div class="chart-empty">3D failed: ' + escHtml(err.message || err) + '</div>';
  });
}

function buildApiLibDepmap(container) {
  dispose3D();
  var W = container.clientWidth || 800;
  var H = container.clientHeight || 600;
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f7fa);
  var camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 1000);
  camera.position.set(0, 8, 18);
  camera.lookAt(0, 0, 0);
  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  var labelRenderer = new window.CSS2DRenderer();
  labelRenderer.setSize(W, H);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.left = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  container.appendChild(labelRenderer.domElement);
  var controls = new window.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxDistance = 40;
  controls.minDistance = 3;
  var ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);
  var hemi = new THREE.HemisphereLight(0xffffff, 0xddeeff, 0.5);
  scene.add(hemi);
  var dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(5, 10, 7);
  dirLight.castShadow = true;
  scene.add(dirLight);
  var shadowGeo = new THREE.CircleGeometry(12, 32);
  var shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.025, depthWrite: false });
  var shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = -0.1;
  scene.add(shadowDisc);

  // Collect endpoints with backend URLs for the graph
  var nodes = [];
  var edgeData = [];
  var nodeMap = {};
  var endpointColor = '#6366f1';
  var backendUrlColor = '#10b981';
  var usedEndpoints = apiLibData.filter(function(e) { return e.backendUrls && e.backendUrls.length > 0; });

  // Cap 3D nodes for performance (the table shows ALL data, the 3D view is a visualization)
  var MAX_3D_NODES = 300;
  var totalPotentialNodes = 0;
  usedEndpoints.forEach(function(ep) {
    totalPotentialNodes += 1 + (ep.backendUrls || []).length;
  });
  if (totalPotentialNodes > MAX_3D_NODES) {
    var notice = document.createElement('div');
    notice.style.cssText = 'position:absolute;top:10px;left:50%;transform:translateX(-50%);font-size:10px;background:rgba(245,158,11,0.9);color:#fff;padding:4px 12px;border-radius:4px;z-index:10;pointer-events:none';
    notice.textContent = totalPotentialNodes + ' total nodes — showing first ' + MAX_3D_NODES + ' for performance. All data available in the table.';
    container.appendChild(notice);
    // Limit endpoints for 3D rendering
    usedEndpoints = usedEndpoints.slice(0, 100);
  }

  usedEndpoints.forEach(function(ep) {
    var epKey = 'ep:' + ep.endpoint + '|' + ep.repoName;
    if (!nodeMap[epKey]) {
      nodeMap[epKey] = { id: epKey, label: ep.endpoint, type: 'endpoint', repo: ep.repoName, group: ep.repoName };
      nodes.push(nodeMap[epKey]);
    }
    (ep.backendUrls || []).forEach(function(bu) {
      var buKey = 'bu:' + bu.url;
      if (!nodeMap[buKey]) {
        nodeMap[buKey] = { id: buKey, label: bu.key, type: 'backend', url: bu.url, propFile: bu.propFile };
        nodes.push(nodeMap[buKey]);
      }
      edgeData.push({ from: epKey, to: buKey });
    });
  });

  if (nodes.length === 0) {
    container.innerHTML = '<div class="chart-empty">No endpoints with backend URLs to visualize.</div>';
    return;
  }

  // Layout: endpoints left, backend urls right
  var epNodes = nodes.filter(function(n) { return n.type === 'endpoint'; });
  var buNodes = nodes.filter(function(n) { return n.type === 'backend'; });
  var radius = Math.max(6, Math.max(epNodes.length, buNodes.length) * 1.2);

  epNodes.forEach(function(n, i) {
    var angle = (i / epNodes.length) * Math.PI * 2 - Math.PI / 2;
    n.x = -radius * 0.6;
    n.y = Math.sin(angle) * radius * 0.5;
    n.z = Math.cos(angle) * radius * 0.5;
  });
  buNodes.forEach(function(n, i) {
    var angle = (i / buNodes.length) * Math.PI * 2 - Math.PI / 2;
    n.x = radius * 0.6;
    n.y = Math.sin(angle) * radius * 0.5;
    n.z = Math.cos(angle) * radius * 0.5;
  });

  var nodeMeshes = [];
  var colorMap = {};
  var repoColors = ['#6366f1', '#22d3ee', '#f59e0b', '#ef4444', '#10b981', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#06b6d4'];
  var colorIdx = 0;
  epNodes.forEach(function(n) {
    if (!colorMap[n.repo]) { colorMap[n.repo] = repoColors[colorIdx % repoColors.length]; colorIdx++; }
  });

  epNodes.forEach(function(n) {
    var r = 0.35;
    var geo = new THREE.SphereGeometry(r, 20, 20);
    var mat = new THREE.MeshPhysicalMaterial({ color: colorMap[n.repo] || endpointColor, roughness: 0.25, metalness: 0.05, emissive: colorMap[n.repo] || endpointColor, emissiveIntensity: 0.08 });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(n.x, n.y, n.z);
    mesh.castShadow = true;
    mesh.userData = { type: 'endpoint', label: n.label, repo: n.repo };
    scene.add(mesh);
    nodeMeshes.push(mesh);

    // Label
    var div = document.createElement('div');
    div.textContent = n.label.length > 20 ? n.label.slice(0, 18) + '...' : n.label;
    div.style.cssText = 'color:#0f172a;font-size:10px;font-weight:600;background:rgba(255,255,255,0.9);padding:2px 6px;border-radius:4px;border:1px solid rgba(0,0,0,0.08);pointer-events:none;white-space:nowrap';
    var label = new window.CSS2DObject(div);
    label.position.set(n.x, n.y - r - 0.5, n.z);
    scene.add(label);
  });

  buNodes.forEach(function(n) {
    var r = 0.3;
    var geo = new THREE.SphereGeometry(r, 20, 20);
    var mat = new THREE.MeshPhysicalMaterial({ color: backendUrlColor, roughness: 0.3, metalness: 0.05, emissive: backendUrlColor, emissiveIntensity: 0.06 });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(n.x, n.y, n.z);
    mesh.castShadow = true;
    mesh.userData = { type: 'backend', label: n.label, url: n.url };
    scene.add(mesh);
    nodeMeshes.push(mesh);

    var div = document.createElement('div');
    div.textContent = n.label.length > 20 ? n.label.slice(0, 18) + '...' : n.label;
    div.style.cssText = 'color:#059669;font-size:10px;font-weight:600;background:rgba(255,255,255,0.9);padding:2px 6px;border-radius:4px;border:1px solid rgba(0,0,0,0.08);pointer-events:none;white-space:nowrap';
    var label = new window.CSS2DObject(div);
    label.position.set(n.x, n.y - r - 0.5, n.z);
    scene.add(label);
  });

  edgeData.forEach(function(ed) {
    var fromN = nodeMap[ed.from];
    var toN = nodeMap[ed.to];
    if (!fromN || !toN) return;
    var fromPos = new THREE.Vector3(fromN.x, fromN.y, fromN.z);
    var toPos = new THREE.Vector3(toN.x, toN.y, toN.z);
    var mid = new THREE.Vector3().addVectors(fromPos, toPos).multiplyScalar(0.5);
    mid.y += 0.5;
    var curve = new THREE.CatmullRomCurve3([fromPos, mid, toPos]);
    var tubeGeo = new THREE.TubeGeometry(curve, 12, 0.025, 5, false);
    var tubeMat = new THREE.MeshPhysicalMaterial({ color: '#94a3b8', transparent: true, opacity: 0.35, roughness: 0.5 });
    var tube = new THREE.Mesh(tubeGeo, tubeMat);
    scene.add(tube);
  });

  // Legend
  var legendDiv = document.createElement('div');
  legendDiv.style.cssText = 'position:absolute;bottom:10px;left:10px;font-size:10px;background:rgba(255,255,255,0.9);padding:6px 10px;border-radius:6px;border:1px solid rgba(0,0,0,0.08);pointer-events:none';
  var legendHtml = '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + backendUrlColor + ';margin-right:4px"></span> Backend URL &nbsp;&nbsp;';
  var seenColors = {};
  for (var ri2 = 0; ri2 < epNodes.length; ri2++) {
    var n2 = epNodes[ri2];
    if (!seenColors[n2.repo]) {
      seenColors[n2.repo] = true;
      legendHtml += '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + (colorMap[n2.repo]) + ';margin-right:4px;margin-left:8px"></span> ' + n2.repo.slice(0, 12) + ' ';
    }
  }
  legendDiv.innerHTML = legendHtml;
  container.appendChild(legendDiv);

  // Interaction
  var raycaster = new THREE.Raycaster();
  var pointer = new THREE.Vector2();
  var tooltipEl2 = document.getElementById('tooltip3d') || (function() {
    var el = document.createElement('div'); el.id = 'tooltip3d'; el.className = 'chart-tooltip';
    el.style.cssText = 'display:none;pointer-events:auto;position:fixed;z-index:9999';
    document.body.appendChild(el); return el;
  })();

  renderer.domElement.addEventListener('mousemove', function(ev) {
    var rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    var intersects = raycaster.intersectObjects(nodeMeshes);
    if (intersects.length > 0) {
      var hit = intersects[0].object;
      var ud = hit.userData;
      var tipHtml = '<div class="tt-header">' + escHtml(ud.label) + '</div>';
      if (ud.type === 'endpoint') tipHtml += '<div class="tt-row"><span>Repo</span><strong>' + escHtml(ud.repo) + '</strong></div>';
      if (ud.type === 'backend') tipHtml += '<div class="tt-row"><span>URL</span><strong style="word-break:break-all;font-size:0.65rem">' + escHtml(ud.url) + '</strong></div>';
      tooltipEl2.innerHTML = tipHtml;
      tooltipEl2.style.display = 'block';
      var tx = ev.clientX + 12, ty = ev.clientY - 30;
      if (tx + 200 > window.innerWidth) tx = ev.clientX - 220;
      if (ty < 10) ty = ev.clientY + 12;
      tooltipEl2.style.left = tx + 'px';
      tooltipEl2.style.top = ty + 'px';
    } else {
      tooltipEl2.style.display = 'none';
    }
  });

  renderer.domElement.addEventListener('mouseleave', function() {
    tooltipEl2.style.display = 'none';
  });

  threeScene = scene;
  threeCamera = camera;
  threeRenderer = renderer;
  threeLabelRenderer = labelRenderer;
  threeControls = controls;

  function animate() {
    threeAnimId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }
  animate();

  var resizeHandler = function() {
    var w2 = container.clientWidth || 800;
    var h2 = container.clientHeight || 600;
    camera.aspect = w2 / h2;
    camera.updateProjectionMatrix();
    renderer.setSize(w2, h2);
    labelRenderer.setSize(w2, h2);
  };
  window.addEventListener('resize', resizeHandler);
  renderer.domElement._resizeHandler = resizeHandler;
}

// ─── Cross-Repo View ──────────────────────────────────────
function showApiLibCrossrepo() {
  var container = $('crossrepoContainer');
  var empty = $('crossrepoEmpty');
  if (!apiLibData || apiLibData.length === 0) {
    empty.style.display = '';
    container.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  container.style.display = '';
  container.innerHTML = '<div class="chart-empty">Building cross-repo graph...</div>';
  loadThreeJS().then(function() {
    buildApiLibCrossrepo(container);
  }).catch(function(err) {
    container.innerHTML = '<div class="chart-empty">3D failed: ' + escHtml(err.message || err) + '</div>';
  });
}

function buildApiLibCrossrepo(container) {
  dispose3D();
  var W = container.clientWidth || 800;
  var H = container.clientHeight || 600;
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f7fa);
  var camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 1000);
  camera.position.set(0, 6, 16);
  camera.lookAt(0, 0, 0);
  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  var labelRenderer = new window.CSS2DRenderer();
  labelRenderer.setSize(W, H);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.left = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  container.appendChild(labelRenderer.domElement);
  var controls = new window.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxDistance = 40;
  controls.minDistance = 3;
  var ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);
  var hemi = new THREE.HemisphereLight(0xffffff, 0xddeeff, 0.5);
  scene.add(hemi);
  var dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(5, 10, 7);
  dirLight.castShadow = true;
  scene.add(dirLight);
  var shadowGeo = new THREE.CircleGeometry(14, 32);
  var shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.025, depthWrite: false });
  var shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = -0.1;
  scene.add(shadowDisc);

  // Build repo→backend URL mapping (cross-repo consumption)
  var repoBackendMap = {};
  var backendReposMap = {};
  apiLibData.forEach(function(ep) {
    var rn = ep.repoName || 'unknown';
    if (!repoBackendMap[rn]) repoBackendMap[rn] = {};
    (ep.backendUrls || []).forEach(function(bu) {
      repoBackendMap[rn][bu.url] = true;
      if (!backendReposMap[bu.url]) backendReposMap[bu.url] = {};
      backendReposMap[bu.url][rn] = true;
    });
  });

  // Find shared backend URLs (consumed by >1 repo)
  var sharedUrls = [];
  for (var bu in backendReposMap) {
    var repos = Object.keys(backendReposMap[bu]);
    if (repos.length > 1) {
      sharedUrls.push({ url: bu, repos: repos, count: repos.length });
    }
  }
  // Also find repos that share any backend
  var repoRepos = {};
  var repoList = Object.keys(repoBackendMap).sort();
  repoList.forEach(function(r) {
    repoRepos[r] = {};
    repoList.forEach(function(r2) {
      if (r === r2) return;
      for (var bu2 in repoBackendMap[r]) {
        if (repoBackendMap[r2][bu2]) {
          repoRepos[r][r2] = (repoRepos[r][r2] || 0) + 1;
        }
      }
    });
  });

  var maxShared = repoList.reduce(function(mx, r) {
    return Math.max(mx, Object.keys(repoRepos[r] || {}).length);
  }, 1);

  var repoNodes = [];
  var repoColors = ['#6366f1', '#22d3ee', '#f59e0b', '#ef4444', '#10b981', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#06b6d4', '#84cc16', '#d946ef'];
  repoList.forEach(function(r, i) {
    var angle = (i / repoList.length) * Math.PI * 2 - Math.PI / 2;
    var rad = Math.max(4, repoList.length * 0.8);
    repoNodes.push({ name: r, x: Math.cos(angle) * rad, z: Math.sin(angle) * rad, color: repoColors[i % repoColors.length] });
  });

  var linkMeshes = [];
  repoNodes.forEach(function(n, i) {
    var r = 0.5;
    var geo = new THREE.SphereGeometry(r, 24, 24);
    var mat = new THREE.MeshPhysicalMaterial({ color: n.color, roughness: 0.25, metalness: 0.05, emissive: n.color, emissiveIntensity: 0.1 });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(n.x, 0, n.z);
    mesh.castShadow = true;
    mesh.userData = { type: 'repo', name: n.name };
    scene.add(mesh);

    var div = document.createElement('div');
    div.textContent = n.name.length > 16 ? n.name.slice(0, 14) + '...' : n.name;
    div.style.cssText = 'color:#0f172a;font-size:10px;font-weight:700;background:rgba(255,255,255,0.95);padding:3px 8px;border-radius:4px;border:1px solid ' + n.color + ';pointer-events:none;white-space:nowrap';
    var label = new window.CSS2DObject(div);
    label.position.set(n.x, -r - 0.6, n.z);
    scene.add(label);

    // Draw edges to connected repos
    for (var j = i + 1; j < repoNodes.length; j++) {
      var n2 = repoNodes[j];
      var sharedCount = repoRepos[n.name] && repoRepos[n.name][n2.name] ? repoRepos[n.name][n2.name] : 0;
      if (sharedCount > 0) {
        var fromPos = new THREE.Vector3(n.x, 0, n.z);
        var toPos = new THREE.Vector3(n2.x, 0, n2.z);
        var mid2 = new THREE.Vector3().addVectors(fromPos, toPos).multiplyScalar(0.5);
        mid2.y += 0.3 + sharedCount * 0.15;
        var curve2 = new THREE.CatmullRomCurve3([fromPos, mid2, toPos]);
        var thickness = 0.02 + sharedCount * 0.015;
        var opacity = Math.min(0.1 + sharedCount * 0.08, 0.5);
        var tubeMat2 = new THREE.MeshPhysicalMaterial({ color: '#6366f1', transparent: true, opacity: opacity, roughness: 0.5 });
        var tube2 = new THREE.Mesh(new THREE.TubeGeometry(curve2, 16, thickness, 5, false), tubeMat2);
        scene.add(tube2);
        linkMeshes.push(tube2);
      }
    }
  });

  // Legend
  var legendDiv = document.createElement('div');
  legendDiv.style.cssText = 'position:absolute;bottom:10px;left:10px;font-size:10px;background:rgba(255,255,255,0.9);padding:6px 10px;border-radius:6px;border:1px solid rgba(0,0,0,0.08);pointer-events:none';
  legendDiv.innerHTML = '<div><strong>Cross-Repo Backend URL Sharing</strong><br><span style="color:#6366f1">●</span> Nodes = Repositories &nbsp; <span style="color:#6366f1">━</span> Edges = Shared backend URLs<br>'
    + 'Shared URLs: ' + sharedUrls.length + ' &nbsp;|&nbsp; Repos: ' + repoList.length + ' &nbsp;|&nbsp; Endpoints: ' + apiLibData.length + '</div>';
  container.appendChild(legendDiv);

  // Shared URLs detail panel
  if (sharedUrls.length > 0) {
    var detailDiv = document.createElement('div');
    detailDiv.style.cssText = 'position:absolute;top:10px;right:10px;font-size:10px;background:rgba(255,255,255,0.95);padding:8px 12px;border-radius:6px;border:1px solid rgba(0,0,0,0.08);max-height:200px;overflow-y:auto;max-width:280px';
    var detailHtml = '<div style="font-weight:700;margin-bottom:4px;color:var(--text)">Shared Backend URLs</div>';
    sharedUrls.slice(0, 15).forEach(function(su) {
      detailHtml += '<div style="margin:2px 0;word-break:break-all;color:var(--text-muted)"><span style="color:#10b981">●</span> ' + escHtml(su.url.slice(0, 40)) + '... <span style="font-weight:600">(' + su.repos.join(', ') + ')</span></div>';
    });
    if (sharedUrls.length > 15) detailHtml += '<div style="color:var(--text-muted)">... and ' + (sharedUrls.length - 15) + ' more</div>';
    detailDiv.innerHTML = detailHtml;
    container.appendChild(detailDiv);
  }

  threeScene = scene;
  threeCamera = camera;
  threeRenderer = renderer;
  threeLabelRenderer = labelRenderer;
  threeControls = controls;
  threeNodes.length = 0;
  threeEdgeMeshes.length = 0;

  function animate() {
    threeAnimId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }
  animate();

  var resizeHandler = function() {
    var w2 = container.clientWidth || 800;
    var h2 = container.clientHeight || 600;
    camera.aspect = w2 / h2;
    camera.updateProjectionMatrix();
    renderer.setSize(w2, h2);
    labelRenderer.setSize(w2, h2);
  };
  window.addEventListener('resize', resizeHandler);
  renderer.domElement._resizeHandler = resizeHandler;
}

// ─── Backend URL Source Tree builder ──────────────────────
function buildBackendUrlSourceTree(backendUrls) {
  if (!backendUrls || backendUrls.length === 0) return '';
  var tree = {};
  backendUrls.forEach(function(bu) {
    var pf = bu.propFile || 'unknown';
    if (!tree[pf]) tree[pf] = [];
    tree[pf].push(bu);
  });
  var html = '';
  var sortedFiles = Object.keys(tree).sort();
  sortedFiles.forEach(function(pf) {
    var displayName = pf.split('/').pop() || pf;
    html += '<div class="tree-node"><span class="tree-propfile">' + escHtml(displayName) + '</span></div>';
    tree[pf].forEach(function(bu) {
      html += '<div class="tree-node" style="padding-left:1rem"><span class="tree-arrow">└─</span><span class="tree-field">' + escHtml(bu.key) + '</span><span class="tree-arrow">→</span><span class="tree-url">' + escHtml(bu.url) + '</span></div>';
    });
  });
  return html;
}

// ─── Download API LIB Report ──────────────────────────────
function downloadApiLibReport() {
  if (!apiLibData || apiLibData.length === 0) { setStatus('No data to export', true); return; }
  var repoMap = {};
  var methodMap = {};
  var totalUrls = 0;
  apiLibData.forEach(function(e) {
    var rn = e.repoName || 'unknown';
    if (!repoMap[rn]) repoMap[rn] = { endpoints: 0, controllers: new Set(), backendUrls: new Set(), urls: [] };
    repoMap[rn].endpoints++;
    if (e.controllerClass) repoMap[rn].controllers.add(e.controllerClass);
    (e.backendUrls || []).forEach(function(bu) {
      repoMap[rn].backendUrls.add(bu.url);
      repoMap[rn].urls.push(bu);
      totalUrls++;
    });
    var m = e.httpMethod || 'UNKNOWN';
    if (!methodMap[m]) methodMap[m] = 0;
    methodMap[m]++;
  });

  var now = new Date().toISOString().slice(0, 10);
  var lines = [];
  lines.push('================================================================================');
  lines.push('  API LIBRARY REPORT');
  lines.push('  Generated: ' + now);
  lines.push('  Total Endpoints: ' + apiLibData.length);
  lines.push('  Total Repos: ' + Object.keys(repoMap).length);
  lines.push('  Total Backend URLs: ' + totalUrls);
  lines.push('  Unlinked URLs: ' + (apiLibUnlinkedUrls ? apiLibUnlinkedUrls.length : 0));
  lines.push('================================================================================');
  lines.push('');

  lines.push('--- ENDPOINTS PER REPO ---');
  var repoEntries = Object.entries(repoMap).sort(function(a, b) { return b[1].endpoints - a[1].endpoints; });
  repoEntries.forEach(function(re) {
    lines.push('  ' + re[0] + ': ' + re[1].endpoints + ' endpoints, ' + re[1].controllers.size + ' controllers, ' + re[1].backendUrls.size + ' backend URLs');
  });
  lines.push('');

  lines.push('--- HTTP METHOD DISTRIBUTION ---');
  var methodEntries = Object.entries(methodMap).sort(function(a, b) { return b[1] - a[1]; });
  methodEntries.forEach(function(me) {
    lines.push('  ' + me[0] + ': ' + me[1]);
  });
  lines.push('');

  lines.push('--- ALL ENDPOINTS ---');
  lines.push('  #,HTTP Method,Endpoint,Controller Class,Repo,Backend URLs,Files');
  apiLibData.forEach(function(e, i) {
    var buStr = (e.backendUrls || []).map(function(b) { return b.key + '=' + b.url; }).join('; ');
    lines.push('  ' + (i + 1) + ',"' + e.httpMethod + '","' + e.endpoint + '","' + (e.controllerClass || '') + '","' + e.repoName + '","' + buStr + '","' + (e.file || '') + '"');
  });
  lines.push('');

  if (apiLibUnlinkedUrls && apiLibUnlinkedUrls.length > 0) {
    lines.push('--- UNLINKED URLs ---');
    lines.push('  #,Key,URL,Property File,Repo');
    apiLibUnlinkedUrls.forEach(function(u, i) {
      lines.push('  ' + (i + 1) + ',"' + u.key + '","' + u.url + '","' + (u.propFile || '') + '","' + (u.repoName || '') + '"');
    });
    lines.push('');
  }

  lines.push('--- CROSS-REPO BACKEND URL SHARING ---');
  var backendReposMap2 = {};
  apiLibData.forEach(function(ep) {
    (ep.backendUrls || []).forEach(function(bu) {
      if (!backendReposMap2[bu.url]) backendReposMap2[bu.url] = new Set();
      backendReposMap2[bu.url].add(ep.repoName);
    });
  });
  var sharedUrls2 = Object.entries(backendReposMap2).filter(function(e) { return e[1].size > 1; }).sort(function(a, b) { return b[1].size - a[1].size; });
  sharedUrls2.forEach(function(su) {
    lines.push('  ' + su[0] + ' → ' + [...su[1]].join(', '));
  });
  if (sharedUrls2.length === 0) lines.push('  No shared backend URLs found across repos.');
  lines.push('');

  lines.push('--- BACKEND URL SOURCE TREE ---');
  var urlPropMap = {};
  apiLibData.forEach(function(ep) {
    (ep.backendUrls || []).forEach(function(bu) {
      var pf = bu.propFile || 'unknown';
      if (!urlPropMap[pf]) urlPropMap[pf] = [];
      if (urlPropMap[pf].indexOf(bu.url) < 0) urlPropMap[pf].push(bu.url);
    });
  });
  for (var pf2 in urlPropMap) {
    lines.push('  ' + pf2);
    urlPropMap[pf2].forEach(function(u) { lines.push('    └─ ' + u); });
  }
  lines.push('');

  lines.push('--- ENDPOINT DEPENDENCY MAP ---');
  var depEdgeCount = 0;
  apiLibData.forEach(function(ep) {
    if (ep.backendUrls && ep.backendUrls.length > 0) {
      lines.push('  ' + ep.endpoint + ' (via ' + ep.repoName + ')');
      ep.backendUrls.forEach(function(bu) {
        lines.push('    └─ ' + bu.key + ' → ' + bu.url + (bu.propFile ? ' [' + bu.propFile + ']' : ''));
        depEdgeCount++;
      });
    }
  });
  if (depEdgeCount === 0) lines.push('  No endpoint-to-backend-URL dependencies found.');
  lines.push('');

  lines.push('================================================================================');
  lines.push('  END OF REPORT');
  lines.push('================================================================================');

  var content = lines.join('\n');
  var blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'api-lib-report-' + now + '.txt';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  setStatus('Report downloaded (' + apiLibData.length + ' endpoints)');
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
