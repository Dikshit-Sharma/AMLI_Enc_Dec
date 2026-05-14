const STORAGE_KEY = 'locr_extension_form';

let abortController = null;
let reportData = null;

function loadForm() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return { baseUrl: 'https://repo.maxlifeinsurance.com/api/v4', token: '', username: '', startDate: '', endDate: '' };
}

function saveForm(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

function $(id) { return document.getElementById(id); }

function show(id) { $(id).style.display = ''; }
function hide(id) { $(id).style.display = 'none'; }

function fmt(n) {
  if (n === undefined || n === null) return '0';
  return Number(n).toLocaleString('en-IN');
}

// Load saved form
const saved = loadForm();
$('baseUrl').value = saved.baseUrl;
$('token').value = saved.token;
$('username').value = saved.username;
$('startDate').value = saved.startDate;
$('endDate').value = saved.endDate;

// Save on input
['baseUrl','token','username','startDate','endDate'].forEach(id => {
  $(id).addEventListener('input', () => {
    saveForm({
      baseUrl: $('baseUrl').value,
      token: $('token').value,
      username: $('username').value,
      startDate: $('startDate').value,
      endDate: $('endDate').value,
    });
  });
});

// Fetch button
$('fetchBtn').addEventListener('click', startReport);

// Cancel button
$('cancelBtn').addEventListener('click', () => {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
});

// Fetch per-file button
$('fetchFilesBtn').addEventListener('click', fetchPerFileDetails);

// --- GitLab API ---

async function apiFetch(baseUrl, endpoint, params, token, signal) {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url, {
    headers: { 'PRIVATE-TOKEN': token },
    signal,
  });
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

// --- Diff parser ---
function countDiff(diffText) {
  const lines = diffText.split('\n');
  let additions = 0, deletions = 0, modified = 0;
  const headers = ['diff --git', 'index ', '--- ', '+++ ', '@@', '\\ No newline at end of file', 'Binary files '];
  const isH = l => headers.some(p => l.startsWith(p));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isH(line) || line.startsWith(' ') || line === '') continue;
    if (line.startsWith('-') && !line.startsWith('---')) {
      if (i + 1 < lines.length && lines[i + 1].startsWith('+') && !lines[i + 1].startsWith('+++')) {
        modified++;
        i++;
        continue;
      }
      deletions++;
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
    }
  }
  return { additions, deletions, modified };
}

// --- Main report ---

async function startReport() {
  const baseUrl = $('baseUrl').value.trim();
  const token = $('token').value.trim();
  const username = $('username').value.trim();
  const startDate = $('startDate').value;
  const endDate = $('endDate').value;

  if (!baseUrl || !token || !username || !startDate || !endDate) {
    showError('All fields are required.');
    return;
  }

  if (endDate < startDate) {
    showError('End date must be >= start date.');
    return;
  }

  abortController = new AbortController();
  const signal = abortController.signal;

  hide('errorSection');
  hide('resultsSection');
  show('progressSection');
  $('fetchBtn').disabled = true;

  try {
    // 1. Find user
    setProgress(5, 'Searching for user...');
    const usersRes = await apiFetch(baseUrl, '/users', { search: username }, token, signal);
    const users = await usersRes.json();
    if (!Array.isArray(users) || users.length === 0) {
      throw new Error(`User not found: ${username}`);
    }
    const user = users[0];
    setProgress(10, `Found user: ${user.name} (ID: ${user.id})`);

    const commitAuthor = user.email || user.public_email || user.username;

    // 2. List membership projects
    setProgress(15, 'Fetching projects...');
    const projects = await paginate(baseUrl, '/projects', { membership: true }, token, signal);
    if (projects.length === 0) {
      throw new Error('No membership projects found.');
    }
    setProgress(20, `Found ${projects.length} projects. Fetching commits...`);

    // 3. For each project, get commits by author in date range
    const commitRows = [];
    const projectMap = {};
    let totalAdd = 0, totalDel = 0;
    let completedProjects = 0;

    for (const proj of projects) {
      if (signal.aborted) throw new Error('Cancelled');

      const pct = 20 + Math.round((completedProjects / projects.length) * 70);
      setProgress(pct, `[${completedProjects + 1}/${projects.length}] Checking ${proj.name || proj.path_with_namespace}...`);

      const commits = await paginate(baseUrl, `/projects/${proj.id}/repository/commits`, {
        author: commitAuthor,
        since: startDate + 'T00:00:00Z',
        until: endDate + 'T23:59:59Z',
        with_stats: 'true',
      }, token, signal);

      const projName = proj.name || proj.path_with_namespace || `Project ${proj.id}`;

      if (!projectMap[proj.id]) {
        projectMap[proj.id] = { name: projName, commitCount: 0, added: 0, deleted: 0 };
      }

      for (const commit of commits) {
        if (signal.aborted) throw new Error('Cancelled');
        const stats = commit.stats || { additions: 0, deletions: 0, total: 0 };
        totalAdd += stats.additions;
        totalDel += stats.deletions;

        projectMap[proj.id].commitCount++;
        projectMap[proj.id].added += stats.additions;
        projectMap[proj.id].deleted += stats.deletions;

        commitRows.push({
          project_name: projName,
          project_id: proj.id,
          commit_id: commit.id,
          commit_short: commit.short_id || commit.id.slice(0, 8),
          commit_title: commit.title || '',
          committed_at: commit.created_at || '',
          additions: stats.additions,
          deletions: stats.deletions,
          total: stats.total,
        });
      }

      completedProjects++;
    }

    setProgress(93, 'Building report...');

    const totals = {
      total_added: totalAdd,
      total_deleted: totalDel,
      total_net: totalAdd - totalDel,
      total_commits: commitRows.length,
      total_projects: Object.keys(projectMap).length,
    };

    reportData = {
      baseUrl,
      token,
      commit_rows: commitRows,
      project_map: projectMap,
      totals,
      projects: Object.values(projectMap).map(p => p.name),
    };

    hide('progressSection');
    show('resultsSection');
    renderResults(reportData);

  } catch (err) {
    if (err.message === 'Cancelled') {
      setProgress(0, 'Cancelled.');
      setTimeout(() => hide('progressSection'), 1500);
    } else {
      hide('progressSection');
      showError(err.message);
    }
  } finally {
    $('fetchBtn').disabled = false;
    abortController = null;
  }
}

// --- Render results ---

function renderResults(data) {
  const { totals, commit_rows, project_map } = data;

  // Summary cards
  $('summaryGrid').innerHTML = `
    <div class="summary-card summary-card--added">
      <div class="summary-value">${fmt(totals.total_added)}</div>
      <div class="summary-label">Lines Added</div>
    </div>
    <div class="summary-card summary-card--deleted">
      <div class="summary-value">${fmt(totals.total_deleted)}</div>
      <div class="summary-label">Lines Deleted</div>
    </div>
    <div class="summary-card summary-card--net">
      <div class="summary-value">${fmt(totals.total_net)}</div>
      <div class="summary-label">Net LOC</div>
    </div>
    <div class="summary-card summary-card--commits">
      <div class="summary-value">${fmt(totals.total_commits)}</div>
      <div class="summary-label">Commits</div>
    </div>
    <div class="summary-card summary-card--projects">
      <div class="summary-value">${fmt(totals.total_projects)}</div>
      <div class="summary-label">Projects</div>
    </div>
  `;

  // Per-project table
  const projEntries = Object.entries(project_map).sort((a, b) => b[1].added - a[1].added);
  $('projectBody').innerHTML = projEntries.map(([id, p]) => `
    <tr>
      <td>${escHtml(p.name)}</td>
      <td>${p.commitCount}</td>
      <td class="text-added">+${fmt(p.added)}</td>
      <td class="text-deleted">-${fmt(p.deleted)}</td>
      <td>${fmt(p.added - p.deleted)}</td>
    </tr>
  `).join('');
  show('projectSection');

  // Commits table
  if (commit_rows.length > 0) {
    $('commitBody').innerHTML = commit_rows.map(r => `
      <tr>
        <td>${escHtml(r.project_name)}</td>
        <td style="font-family:monospace;font-size:12px">${escHtml(r.commit_short)}</td>
        <td class="text-truncate" title="${escHtml(r.commit_title)}">${escHtml(r.commit_title)}</td>
        <td class="text-muted">${r.committed_at ? new Date(r.committed_at).toLocaleDateString('en-IN') : '-'}</td>
        <td class="text-added">+${fmt(r.additions)}</td>
        <td class="text-deleted">-${fmt(r.deletions)}</td>
        <td>${fmt(r.total)}</td>
      </tr>
    `).join('');
    show('commitSection');

    if (commit_rows.length > 500) {
      $('commitSection').querySelector('.section-title').textContent =
        `Commits (showing ${commit_rows.length})`;
    }
  }

  // Per-file section (show button, data loaded on demand)
  if (commit_rows.length > 0) {
    show('fileSection');
  }

  // Scroll to results
  $('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// --- Per-file details ---

let fileDetailsLoading = false;

async function fetchPerFileDetails() {
  if (fileDetailsLoading) return;
  if (!reportData) return;

  fileDetailsLoading = true;
  $('fetchFilesBtn').disabled = true;
  $('fetchFilesBtn').textContent = 'Loading...';
  show('fileProgress');
  $('fileProgress').textContent = 'Fetching diffs for each commit...';
  hide('fileTableWrap');

  const signal = abortController ? abortController.signal : new AbortController().signal;
  const { baseUrl, token, commit_rows } = reportData;
  const fileRows = [];
  let completed = 0;

  try {
    for (const commit of commit_rows) {
      if (signal.aborted) throw new Error('Cancelled');

      $('fileProgress').textContent = `[${completed + 1}/${commit_rows.length}] ${commit.project_name}: ${commit.commit_short}`;

      const res = await apiFetch(baseUrl, `/projects/${commit.project_id}/repository/commits/${commit.commit_id}/diff`, {}, token, signal);
      const diffs = await res.json();

      if (Array.isArray(diffs)) {
        for (const diff of diffs) {
          const filePath = diff.new_path || diff.old_path || 'UNKNOWN';
          const result = countDiff(diff.diff || '');
          fileRows.push({
            project_name: commit.project_name,
            commit_short: commit.commit_short,
            file: filePath,
            added: result.additions,
            deleted: result.deletions,
            modified: result.modified,
            net: result.additions + result.modified - result.deletions,
          });
        }
      }

      completed++;
    }

    // Render file table
    if (fileRows.length > 0) {
      $('fileBody').innerHTML = fileRows.map(r => `
        <tr>
          <td>${escHtml(r.project_name)}</td>
          <td style="font-family:monospace;font-size:12px">${escHtml(r.commit_short)}</td>
          <td style="font-size:12px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(r.file)}">${escHtml(r.file)}</td>
          <td class="text-added">+${r.added}</td>
          <td class="text-deleted">-${r.deleted}</td>
          <td style="color:#3498db">~${r.modified}</td>
          <td>${r.net}</td>
        </tr>
      `).join('');
      show('fileTableWrap');
      $('fileProgress').textContent = `${fileRows.length} file changes across ${commit_rows.length} commits.`;
    } else {
      $('fileProgress').textContent = 'No file changes found.';
    }

  } catch (err) {
    if (err.message === 'Cancelled') {
      $('fileProgress').textContent = 'Cancelled.';
    } else {
      $('fileProgress').textContent = `Error: ${err.message}`;
    }
  } finally {
    fileDetailsLoading = false;
    $('fetchFilesBtn').disabled = false;
    $('fetchFilesBtn').textContent = 'Fetch Per-File Details';
  }
}

// --- Helpers ---

function escHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function showError(msg) {
  $('errorSection').style.display = '';
  $('errorSection').innerHTML = `<div class="card"><div class="error-message">${escHtml(msg)}</div></div>`;
  $('errorSection').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
