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
    throw new Error(`GitLab API ${res.status} ${url.pathname}${body ? ': ' + body.slice(0, 200) : ''}`);
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

// --- LOC Calculator (same logic as Python gitlab_loc_report.py) ---

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

function parseFileChanges(changes) {
  const results = [];
  for (const change of (changes || [])) {
    const filePath = change.new_path || change.old_path || 'UNKNOWN';
    const diffText = change.diff || '';
    const { additions, deletions, modified } = countDiff(diffText);
    results.push({ file: filePath, added: additions, deleted: deletions, modified, net: additions + modified - deletions });
  }
  return results;
}

// --- Main report (MR-based) ---

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
    // 1. Find user by username
    setProgress(3, 'Searching for user...');
    const usersRes = await apiFetch(baseUrl, '/users', { search: username }, token, signal);
    const users = await usersRes.json();
    if (!Array.isArray(users) || users.length === 0) {
      throw new Error(`User not found: ${username}`);
    }
    const user = users[0];
    const userId = user.id;
    setProgress(5, `Found user: ${user.name} (ID: ${userId})`);

    // 2. List membership projects
    setProgress(8, 'Fetching projects...');
    const projects = await paginate(baseUrl, '/projects', { membership: true }, token, signal);
    if (projects.length === 0) {
      throw new Error('No membership projects found.');
    }
    setProgress(10, `Found ${projects.length} projects. Scanning MRs...`);

    // 3. For each project, find merged MRs by author in date range
    const start = new Date(startDate + 'T00:00:00Z');
    const end = new Date(endDate + 'T23:59:59Z');

    const mrRows = [];
    const fileRows = [];
    const projectMap = {};
    let grandAdded = 0, grandDeleted = 0, grandModified = 0;
    let scannedProjects = 0, totalMatchingMRs = 0;

    for (const proj of projects) {
      if (signal.aborted) throw new Error('Cancelled');

      const pct = 10 + Math.round((scannedProjects / projects.length) * 70);
      setProgress(pct, `[${scannedProjects + 1}/${projects.length}] ${proj.name || proj.path_with_namespace}...`);

      const projName = proj.name || proj.path_with_namespace || `Project ${proj.id}`;

      // Fetch merged MRs by this author
      const mrs = await paginate(baseUrl, `/projects/${proj.id}/merge_requests`, {
        author_id: userId,
        state: 'merged',
        per_page: 100,
      }, token, signal);

      let projectAdded = 0, projectDeleted = 0, projectModified = 0, projectMRs = 0;

      for (const mr of mrs) {
        if (signal.aborted) throw new Error('Cancelled');

        const mergedAt = mr.merged_at;
        if (!mergedAt) continue;

        const mergedDate = new Date(mergedAt);
        if (mergedDate < start || mergedDate > end) continue;

        // Fetch MR changes (diffs)
        const changesRes = await apiFetch(baseUrl, `/projects/${proj.id}/merge_requests/${mr.iid}/changes`, {}, token, signal);
        const changesData = await changesRes.json();
        const fileStats = parseFileChanges(changesData.changes || []);

        const mrAdded = fileStats.reduce((s, f) => s + f.added, 0);
        const mrDeleted = fileStats.reduce((s, f) => s + f.deleted, 0);
        const mrModified = fileStats.reduce((s, f) => s + f.modified, 0);
        const mrNet = mrAdded + mrModified - mrDeleted;

        grandAdded += mrAdded;
        grandDeleted += mrDeleted;
        grandModified += mrModified;
        projectAdded += mrAdded;
        projectDeleted += mrDeleted;
        projectModified += mrModified;
        projectMRs++;
        totalMatchingMRs++;

        mrRows.push({
          project_name: projName,
          project_id: proj.id,
          mr_iid: mr.iid,
          mr_title: mr.title || '',
          merged_at: mergedAt,
          added: mrAdded,
          deleted: mrDeleted,
          modified: mrModified,
          net_loc: mrNet,
        });

        for (const fs of fileStats) {
          fileRows.push({
            project_name: projName,
            project_id: proj.id,
            mr_iid: mr.iid,
            file: fs.file,
            added: fs.added,
            deleted: fs.deleted,
            modified: fs.modified,
            net: fs.net,
          });
        }
      }

      if (projectMRs > 0) {
        projectMap[proj.id] = { name: projName, mrs: projectMRs, added: projectAdded, deleted: projectDeleted, modified: projectModified };
      }

      scannedProjects++;
    }

    setProgress(95, 'Building report...');

    const totals = {
      total_added: grandAdded,
      total_deleted: grandDeleted,
      total_modified: grandModified,
      total_net: grandAdded + grandModified - grandDeleted,
      total_mrs: totalMatchingMRs,
      total_projects: Object.keys(projectMap).length,
    };

    reportData = { mr_rows: mrRows, file_rows: fileRows, totals, project_map: projectMap };

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
  const { totals, mr_rows, file_rows, project_map } = data;

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
    <div class="summary-card" style="border-top-color:#3498db">
      <div class="summary-value">${fmt(totals.total_modified)}</div>
      <div class="summary-label">Lines Modified</div>
    </div>
    <div class="summary-card summary-card--net">
      <div class="summary-value">${fmt(totals.total_net)}</div>
      <div class="summary-label">Net LOC</div>
    </div>
    <div class="summary-card summary-card--commits">
      <div class="summary-value">${fmt(totals.total_mrs)}</div>
      <div class="summary-label">Merge Requests</div>
    </div>
  `;

  // Per-project table
  const projEntries = Object.values(project_map).sort((a, b) => b.added - a.added);
  if (projEntries.length > 0) {
    $('projectBody').innerHTML = projEntries.map(p => `
      <tr>
        <td>${escHtml(p.name)}</td>
        <td>${p.mrs}</td>
        <td class="text-added">+${fmt(p.added)}</td>
        <td class="text-deleted">-${fmt(p.deleted)}</td>
        <td>${fmt(p.added + p.modified - p.deleted)}</td>
      </tr>
    `).join('');
    show('projectSection');
  }

  // MRs table
  if (mr_rows.length > 0) {
    $('mrBody').innerHTML = mr_rows.map(r => `
      <tr>
        <td style="font-size:13px">${escHtml(r.project_name)}</td>
        <td>!${r.mr_iid}</td>
        <td class="text-truncate" title="${escHtml(r.mr_title)}">${escHtml(r.mr_title)}</td>
        <td class="text-muted">${r.merged_at ? new Date(r.merged_at).toLocaleDateString('en-IN') : '-'}</td>
        <td class="text-added">+${fmt(r.added)}</td>
        <td class="text-deleted">-${fmt(r.deleted)}</td>
        <td style="color:#3498db">~${fmt(r.modified)}</td>
        <td style="font-weight:600">${fmt(r.net_loc)}</td>
      </tr>
    `).join('');
    show('mrSection');
  }

  // Per-file table
  if (file_rows.length > 0 && file_rows.length <= 500) {
    $('fileBody').innerHTML = file_rows.map(r => `
      <tr>
        <td style="font-size:12px">${escHtml(r.project_name)}</td>
        <td>!${r.mr_iid}</td>
        <td style="font-size:12px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(r.file)}">${escHtml(r.file)}</td>
        <td class="text-added">+${fmt(r.added)}</td>
        <td class="text-deleted">-${fmt(r.deleted)}</td>
        <td style="color:#3498db">~${fmt(r.modified)}</td>
        <td>${fmt(r.net)}</td>
      </tr>
    `).join('');
    show('fileTableWrap');
    show('fileSection');
  } else if (file_rows.length > 500) {
    show('fileSection');
    $('fileTableWrap').style.display = 'none';
    const note = document.createElement('p');
    note.className = 'info-note';
    note.textContent = `${file_rows.length} file changes found. First 500 shown in the table below.`;
    // Show first 500
    $('fileBody').innerHTML = file_rows.slice(0, 500).map(r => `
      <tr>
        <td style="font-size:12px">${escHtml(r.project_name)}</td>
        <td>!${r.mr_iid}</td>
        <td style="font-size:12px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(r.file)}">${escHtml(r.file)}</td>
        <td class="text-added">+${fmt(r.added)}</td>
        <td class="text-deleted">-${fmt(r.deleted)}</td>
        <td style="color:#3498db">~${fmt(r.modified)}</td>
        <td>${fmt(r.net)}</td>
      </tr>
    `).join('');
    show('fileTableWrap');
  }

  $('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
