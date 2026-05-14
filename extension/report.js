const STORAGE_KEY = 'locr_extension_form';

let abortController = null;

function loadForm() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return { reportType: 'mr', baseUrl: 'https://repo.maxlifeinsurance.com/api/v4', token: '', username: '', commitAuthor: '', startDate: '', endDate: '' };
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

const saved = loadForm();
$('reportType').value = saved.reportType || 'mr';
$('baseUrl').value = saved.baseUrl;
$('token').value = saved.token;
$('username').value = saved.username;
$('commitAuthor').value = saved.commitAuthor || '';
$('startDate').value = saved.startDate;
$('endDate').value = saved.endDate;

toggleCommitAuthorField();

$('reportType').addEventListener('change', () => {
  toggleCommitAuthorField();
  saveAll();
});

['baseUrl','token','username','commitAuthor','startDate','endDate'].forEach(id => {
  $(id).addEventListener('input', saveAll);
});

function saveAll() {
  saveForm({
    reportType: $('reportType').value,
    baseUrl: $('baseUrl').value,
    token: $('token').value,
    username: $('username').value,
    commitAuthor: $('commitAuthor').value,
    startDate: $('startDate').value,
    endDate: $('endDate').value,
  });
}

function toggleCommitAuthorField() {
  if ($('reportType').value === 'commit') {
    show('commitAuthorRow');
  } else {
    hide('commitAuthorRow');
  }
}

$('fetchBtn').addEventListener('click', startReport);
$('cancelBtn').addEventListener('click', () => {
  if (abortController) { abortController.abort(); abortController = null; }
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

// --- LOC Calculator ---

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
    results.push({ file: filePath, added: additions, deleted: deletions, modified, net: additions + modified - deletions });
  }
  return results;
}

// --- Main entry ---

async function startReport() {
  const baseUrl = $('baseUrl').value.trim();
  const token = $('token').value.trim();
  const username = $('username').value.trim();
  const startDate = $('startDate').value;
  const endDate = $('endDate').value;
  const reportType = $('reportType').value;

  if (!baseUrl || !token || !username || !startDate || !endDate) {
    showError('All fields are required.');
    return;
  }
  if (endDate < startDate) {
    showError('End date must be >= start date.');
    return;
  }
  if (reportType === 'commit' && !$('commitAuthor').value.trim()) {
    showError('Commit Author is required for BY COMMIT mode. Enter your git commit email or name.');
    return;
  }

  abortController = new AbortController();
  const signal = abortController.signal;

  hide('errorSection');
  hide('resultsSection');
  show('progressSection');
  $('fetchBtn').disabled = true;

  try {
    setProgress(3, 'Searching for user...');
    const usersRes = await apiFetch(baseUrl, '/users', { search: username }, token, signal);
    const users = await usersRes.json();
    if (!Array.isArray(users) || users.length === 0) {
      throw new Error(`User not found: ${username}`);
    }
    const user = users[0];
    setProgress(5, `Found user: ${user.name} (ID: ${user.id})`);

    setProgress(8, 'Fetching projects...');
    const projects = await paginate(baseUrl, '/projects', { membership: true }, token, signal);
    if (projects.length === 0) throw new Error('No membership projects found.');

    let result;
    if (reportType === 'mr') {
      result = await generateMRReport(baseUrl, token, user, projects, startDate, endDate, signal);
    } else {
      result = await generateCommitReport(baseUrl, token, user, projects, startDate, endDate, signal);
    }

    setProgress(97, 'Building report...');
    hide('progressSection');
    show('resultsSection');
    renderResults(result, reportType);

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

// --- MR mode ---

async function generateMRReport(baseUrl, token, user, projects, startDate, endDate, signal) {
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T23:59:59Z');
  const userId = user.id;

  const mrRows = [];
  const fileRows = [];
  const projectMap = {};
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

      grandAdded += mrAdded; grandDeleted += mrDeleted; grandModified += mrModified;
      pAdded += mrAdded; pDeleted += mrDeleted; pModified += mrModified; pMRs++;

      mrRows.push({
        project_name: projName, project_id: proj.id, mr_iid: mr.iid,
        mr_title: mr.title || '', merged_at: mr.merged_at,
        added: mrAdded, deleted: mrDeleted, modified: mrModified, net_loc: mrNet,
      });

      for (const fs of fileStats) {
        fileRows.push({
          project_name: projName, project_id: proj.id, id: mr.iid, idLabel: `!${mr.iid}`,
          file: fs.file, added: fs.added, deleted: fs.deleted, modified: fs.modified, net: fs.net,
        });
      }
    }

    if (pMRs > 0) {
      projectMap[proj.id] = { name: projName, count: pMRs, added: pAdded, deleted: pDeleted, modified: pModified };
    }
    scanned++;
  }

  return {
    type: 'mr',
    totals: {
      total_added: grandAdded, total_deleted: grandDeleted, total_modified: grandModified,
      total_net: grandAdded + grandModified - grandDeleted, total_items: mrRows.length,
    },
    detailRows: mrRows,
    fileRows,
    projectMap,
  };
}

// --- Commit mode ---

async function generateCommitReport(baseUrl, token, user, projects, startDate, endDate, signal) {
  const commitAuthor = $('commitAuthor').value.trim();
  const since = startDate + 'T00:00:00Z';
  const until = endDate + 'T23:59:59Z';

  const commitRows = [];
  const fileRows = [];
  const projectMap = {};
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

      commitRows.push({
        project_name: projName, project_id: proj.id,
        commit_id: commit.id, commit_short: shortId, commit_title: commit.title || '',
        committed_at: commit.created_at || '',
        additions: stats.additions, deletions: stats.deletions, total: stats.total,
      });

      // Fetch per-file diff for this commit
      try {
        const diffRes = await apiFetch(baseUrl, `/projects/${proj.id}/repository/commits/${commit.id}/diff`, {}, token, signal);
        const diffs = await diffRes.json();
        if (Array.isArray(diffs)) {
          for (const diff of diffs) {
            const filePath = diff.new_path || diff.old_path || 'UNKNOWN';
            const { additions: fa, deletions: fd, modified: fm } = countDiff(diff.diff || '');
            fileRows.push({
              project_name: projName, project_id: proj.id, id: shortId, idLabel: shortId,
              file: filePath, added: fa, deleted: fd, modified: fm, net: fa + fm - fd,
            });
          }
        }
      } catch {
        // Skip per-file if diff fails (some commits may be large)
      }
    }

    if (pCommits > 0) {
      projectMap[proj.id] = { name: projName, count: pCommits, added: pAdded, deleted: pDeleted, modified: 0 };
    }
    scanned++;
  }

  return {
    type: 'commit',
    totals: {
      total_added: grandAdded, total_deleted: grandDeleted, total_modified: 0,
      total_net: grandAdded - grandDeleted, total_items: commitRows.length,
    },
    detailRows: commitRows,
    fileRows,
    projectMap,
  };
}

// --- Render ---

function renderResults(data, reportType) {
  const { totals, detailRows, fileRows, projectMap } = data;
  const isMR = reportType === 'mr';

  $('summaryGrid').innerHTML = `
    <div class="summary-card summary-card--added">
      <div class="summary-value">${fmt(totals.total_added)}</div>
      <div class="summary-label">Lines Added</div>
    </div>
    <div class="summary-card summary-card--deleted">
      <div class="summary-value">${fmt(totals.total_deleted)}</div>
      <div class="summary-label">Lines Deleted</div>
    </div>
    ${isMR ? `
    <div class="summary-card" style="border-top-color:#3498db">
      <div class="summary-value">${fmt(totals.total_modified)}</div>
      <div class="summary-label">Lines Modified</div>
    </div>
    ` : ''}
    <div class="summary-card summary-card--net">
      <div class="summary-value">${fmt(totals.total_net)}</div>
      <div class="summary-label">Net LOC</div>
    </div>
    <div class="summary-card summary-card--commits">
      <div class="summary-value">${fmt(totals.total_items)}</div>
      <div class="summary-label">${isMR ? 'Merge Requests' : 'Commits'}</div>
    </div>
  `;

  // Per-project
  const projEntries = Object.values(projectMap).sort((a, b) => b.added - a.added);
  if (projEntries.length > 0) {
    $('projectCountHeader').textContent = isMR ? 'MRs' : 'Commits';
    if (isMR) {
      $('projectBody').innerHTML = projEntries.map(p => `
        <tr>
          <td>${escHtml(p.name)}</td>
          <td>${p.count}</td>
          <td class="text-added">+${fmt(p.added)}</td>
          <td class="text-deleted">-${fmt(p.deleted)}</td>
          <td style="color:#3498db">~${fmt(p.modified)}</td>
          <td>${fmt(p.added + p.modified - p.deleted)}</td>
        </tr>
      `).join('');
    } else {
      $('projectBody').innerHTML = projEntries.map(p => `
        <tr>
          <td>${escHtml(p.name)}</td>
          <td>${p.count}</td>
          <td class="text-added">+${fmt(p.added)}</td>
          <td class="text-deleted">-${fmt(p.deleted)}</td>
          <td style="color:#3498db">~0</td>
          <td>${fmt(p.added - p.deleted)}</td>
        </tr>
      `).join('');
    }
    show('projectSection');
  }

  // Detail table
  if (isMR) {
    hide('commitSection');
    if (detailRows.length > 0) {
      $('mrBody').innerHTML = detailRows.map(r => `
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
  } else {
    hide('mrSection');
    if (detailRows.length > 0) {
      $('commitBody').innerHTML = detailRows.map(r => `
        <tr>
          <td style="font-size:13px">${escHtml(r.project_name)}</td>
          <td style="font-family:monospace;font-size:12px">${escHtml(r.commit_short)}</td>
          <td class="text-truncate" title="${escHtml(r.commit_title)}">${escHtml(r.commit_title)}</td>
          <td class="text-muted">${r.committed_at ? new Date(r.committed_at).toLocaleDateString('en-IN') : '-'}</td>
          <td class="text-added">+${fmt(r.additions)}</td>
          <td class="text-deleted">-${fmt(r.deletions)}</td>
          <td>${fmt(r.total)}</td>
        </tr>
      `).join('');
      show('commitSection');
    }
  }

  // Per-file
  $('fileIdHeader').textContent = isMR ? 'MR' : 'Commit';
  if (fileRows.length > 0) {
    const display = fileRows.length <= 500 ? fileRows : fileRows.slice(0, 500);
    $('fileBody').innerHTML = display.map(r => `
      <tr>
        <td style="font-size:12px">${escHtml(r.project_name)}</td>
        <td style="font-family:monospace;font-size:12px">${escHtml(r.idLabel)}</td>
        <td style="font-size:12px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(r.file)}">${escHtml(r.file)}</td>
        <td class="text-added">+${fmt(r.added)}</td>
        <td class="text-deleted">-${fmt(r.deleted)}</td>
        <td style="color:#3498db">~${fmt(r.modified)}</td>
        <td>${fmt(r.net)}</td>
      </tr>
    `).join('');
    show('fileTableWrap');
    show('fileSection');
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
