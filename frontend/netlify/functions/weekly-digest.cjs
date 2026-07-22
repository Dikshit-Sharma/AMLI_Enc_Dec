const admin = require('firebase-admin');

const FIREBASE_SERVICE_ACCOUNT = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT || '{}'
);

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(FIREBASE_SERVICE_ACCOUNT),
  });
}

const db = admin.firestore();

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const DIGEST_FROM = process.env.DIGEST_FROM || 'dikshit.sharma2580@gmail.com';
const DIGEST_RECIPIENT = process.env.DIGEST_RECIPIENT || 'dikshit.sharma2580@gmail.com';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

function formatPercent(n) {
  return (n * 100).toFixed(1) + '%';
}

function formatTrend(current, previous) {
  if (!previous || previous === 0) return '';
  const diff = ((current - previous) / previous) * 100;
  const arrow = diff >= 0 ? '↑' : '↓';
  const color = diff >= 0 ? '#22c55e' : '#ef4444';
  return `<span style="color:${color};font-weight:700">${arrow} ${Math.abs(diff).toFixed(1)}%</span>`;
}

function barHtml(pct, color) {
  return `<div style="background:#eee;border-radius:4px;height:8px;width:100%"><div style="background:${color};height:8px;border-radius:4px;width:${Math.min(100, pct).toFixed(1)}%"></div></div>`;
}

async function getPreviousSnapshot() {
  try {
    const snap = await db.collection('digest_snapshots').orderBy('date', 'desc').limit(1).get();
    if (!snap.empty) return snap.docs[0].data();
  } catch (_) {}
  return null;
}

async function saveSnapshot(stats) {
  try {
    await db.collection('digest_snapshots').add({
      date: new Date().toISOString().slice(0, 10),
      ...stats,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (_) {}
}

async function generateAiSummary(stats) {
  if (!GROQ_API_KEY) return null;
  try {
    const prompt = `You are a senior technical architect writing a weekly security & deployment ecosystem report. Be concise but specific.

Write a structured summary with these exact sections using plain text:

SECTION 1 - HIGHLIGHTS (2-3 bullet points):
- What changed this week vs last week (quantify with numbers)
- Any security concerns or wins
- Notable deployment activity

SECTION 2 - RISKS & ACTION ITEMS (2-3 bullet points):
- Credential exposure risks (if any credentials found)
- Encryption gaps by environment
- Any anomalies or things needing attention

SECTION 3 - OUTLOOK:
- One sentence on ecosystem health trend

Stats for this week:
- Total artifacts: ${stats.total}
- New this week: ${stats.newThisWeek} (last week total: ${stats.lastWeek?.total || 'N/A'})
- Credentials found: ${stats.newCredentials}
- DEV: ${stats.envCounts?.DEV || 0} artifacts, ${formatPercent(stats.encryptionRates?.DEV || 0)} encrypted
- UAT: ${stats.envCounts?.UAT || 0} artifacts, ${formatPercent(stats.encryptionRates?.UAT || 0)} encrypted
- PROD: ${stats.envCounts?.PROD || 0} artifacts, ${formatPercent(stats.encryptionRates?.PROD || 0)} encrypted
- Top active APIs: ${stats.topChanged?.slice(0, 5).map(a => a.apiName).join(', ') || 'None'}
- Domains scanned: ${Object.keys(stats.domainCounts || {}).length}`;
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
      }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (_) {
    return null;
  }
}

function buildHtmlEmail(stats, aiSummary) {
  const lastWeek = stats.lastWeek;
  const diffTotal = lastWeek ? stats.total - lastWeek.total : null;

  const envRows = ['DEV', 'UAT', 'PROD'].map(e => {
    const count = stats.envCounts?.[e] || 0;
    const enc = stats.encryptedCounts?.[e] || 0;
    const rate = stats.encryptionRates?.[e] || 0;
    const pct = stats.total ? (count / stats.total * 100) : 0;
    return `<tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;font-weight:700;color:#333;width:80px">${e}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;width:60px;text-align:center;font-size:20px;font-weight:700;color:#6366f1">${count}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0">${barHtml(pct, e === 'PROD' ? '#ef4444' : e === 'UAT' ? '#f59e0b' : '#3b82f6')}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;width:100px;text-align:center"><span style="color:${rate >= 0.9 ? '#22c55e' : rate >= 0.5 ? '#f59e0b' : '#ef4444'};font-weight:700">${formatPercent(rate)}</span></td>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;width:60px;text-align:center;color:#666">${enc}/${count}</td>
    </tr>`;
  }).join('');

  const apiRows = (stats.topChanged || []).slice(0, 10).map((a, i) => `
    <tr style="${i % 2 === 0 ? 'background:#fafafa' : ''}">
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-weight:600;font-size:14px">${i + 1}. ${a.apiName || 'Unknown'}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;text-align:center">
        <span style="background:${a.env === 'PROD' ? '#fef2f2;color:#ef4444' : a.env === 'UAT' ? '#fffbeb;color:#f59e0b' : '#eff6ff;color:#3b82f6'};padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:700">${a.env}</span>
      </td>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;text-align:center;font-weight:700;color:#6366f1">${a.count}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;text-align:center;color:#666;font-size:13px">${a.jiraTicket || '—'}</td>
    </tr>
  `).join('');

  const domainRows = Object.entries(stats.domainCounts || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([domain, count], i) => {
      const pct = stats.total ? (count / stats.total * 100) : 0;
      return `<tr>
        <td style="padding:8px 16px;border-bottom:1px solid #f0f0f0;font-size:13px;font-weight:600">${domain}</td>
        <td style="padding:8px 16px;border-bottom:1px solid #f0f0f0;text-align:center;color:#6366f1;font-weight:700">${count}</td>
        <td style="padding:8px 16px;border-bottom:1px solid #f0f0f0">${barHtml(pct, '#6366f1')}</td>
        <td style="padding:8px 16px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:12px;color:#888">${formatPercent(pct)}</td>
      </tr>`;
    }).join('');

  const credentialRisk = stats.newCredentials > 0
    ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px;margin-bottom:24px">
        <div style="font-size:15px;font-weight:700;color:#ef4444;margin-bottom:6px">⚠️ Credential Exposure Alert</div>
        <div style="font-size:13px;color:#991b1b;line-height:1.6">
          <strong>${stats.newCredentials}</strong> credential(s) detected across the ecosystem.
          Credentials in plaintext artifacts are a security risk — encrypt all secrets using AMLI encryption service.
        </div>
      </div>`
    : `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin-bottom:24px">
        <div style="font-size:15px;font-weight:700;color:#166534;margin-bottom:6px">✅ No Credential Exposure</div>
        <div style="font-size:13px;color:#166534;line-height:1.6">No plaintext credentials found in scanned artifacts this week.</div>
      </div>`;

  const aiFormatted = aiSummary
    ? aiSummary.replace(/SECTION 1[\s:-]*HIGHLIGHTS/g, '<strong>🟢 Highlights</strong>')
      .replace(/SECTION 2[\s:-]*RISKS?[\s&]*ACTION ITEMS?/g, '<strong>🔴 Risks & Action Items</strong>')
      .replace(/SECTION 3[\s:-]*OUTLOOK/g, '<strong>📋 Outlook</strong>')
      .replace(/\n- /g, '<br>• ')
      .replace(/\n/g, '<br>')
    : null;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f0f2f5;margin:0;padding:0">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px">
    <table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08)">

      <!-- Header -->
      <tr>
        <td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 50%,#a855f7 100%);padding:48px 40px;text-align:center">
          <div style="font-size:42px;margin-bottom:8px">📊</div>
          <h1 style="color:#fff;margin:0 0 6px;font-size:26px;font-weight:800;letter-spacing:-0.5px">Weekly Ecosystem Digest</h1>
          <p style="color:rgba(255,255,255,0.85);margin:0;font-size:14px">AMLI Security & Deployment Report</p>
          <div style="margin-top:16px;display:inline-block;background:rgba(255,255,255,0.15);padding:8px 20px;border-radius:24px;font-size:13px;color:#fff">
            📅 ${stats.weekRange}
          </div>
        </td>
      </tr>

      <tr><td style="padding:36px 40px">

        <!-- AI Summary -->
        ${aiFormatted ? `
        <div style="background:linear-gradient(135deg,#f0fdf4,#ecfdf5);border:1px solid #bbf7d0;border-radius:16px;padding:24px;margin-bottom:28px">
          <div style="font-size:13px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">🤖 AI-Powered Summary</div>
          <div style="font-size:14px;color:#166534;line-height:1.8">${aiFormatted}</div>
        </div>` : ''}

        <!-- Quick Stats -->
        <div style="display:flex;gap:16px;margin-bottom:28px">
          <div style="flex:1;background:linear-gradient(135deg,#eff6ff,#dbeafe);border-radius:14px;padding:20px;text-align:center">
            <div style="font-size:36px;font-weight:800;color:#3b82f6">${stats.total}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;text-transform:uppercase;letter-spacing:0.5px">Total Artifacts</div>
            ${diffTotal !== null ? `<div style="margin-top:4px;font-size:12px">${diffTotal >= 0 ? '📈' : '📉'} ${diffTotal >= 0 ? '+' : ''}${diffTotal} ${formatTrend(stats.total, lastWeek?.total)}</div>` : ''}
          </div>
          <div style="flex:1;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-radius:14px;padding:20px;text-align:center">
            <div style="font-size:36px;font-weight:800;color:#22c55e">${stats.newThisWeek}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;text-transform:uppercase;letter-spacing:0.5px">Added This Week</div>
          </div>
          <div style="flex:1;background:linear-gradient(135deg,#fefce8,#fef9c3);border-radius:14px;padding:20px;text-align:center">
            <div style="font-size:36px;font-weight:800;color:#f59e0b">${stats.newCredentials}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;text-transform:uppercase;letter-spacing:0.5px">Credentials Found</div>
          </div>
        </div>

        <!-- Credential Risk -->
        ${credentialRisk}

        <!-- Per-Environment Breakdown -->
        <div style="margin-bottom:28px">
          <div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:12px">🌍 Per-Environment Breakdown</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
            <tr style="background:#f8fafc">
              <th style="text-align:left;padding:10px 16px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0;width:80px">Env</th>
              <th style="text-align:center;padding:10px 16px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0;width:60px">Count</th>
              <th style="text-align:left;padding:10px 16px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0">Distribution</th>
              <th style="text-align:center;padding:10px 16px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0;width:100px">Enc. Rate</th>
              <th style="text-align:center;padding:10px 16px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0;width:60px">Enc</th>
            </tr>
            ${envRows}
          </table>
        </div>

        <!-- Encryption Coverage Chart -->
        <div style="background:#f8fafc;border-radius:14px;padding:20px;margin-bottom:28px">
          <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:14px">🔒 Encryption Coverage by Environment</div>
          ${['DEV', 'UAT', 'PROD'].map(e => {
            const rate = (stats.encryptionRates?.[e] || 0) * 100;
            const color = rate >= 90 ? '#22c55e' : rate >= 60 ? '#f59e0b' : '#ef4444';
            return `<div style="margin-bottom:10px">
              <div style="display:flex;justify-content:space-between;margin-bottom:3px">
                <span style="font-size:12px;font-weight:700;color:#475569">${e}</span>
                <span style="font-size:12px;font-weight:700;color:${color}">${rate.toFixed(1)}%</span>
              </div>
              ${barHtml(rate, color)}
            </div>`;
          }).join('')}
          <div style="margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between">
            <span style="font-size:12px;font-weight:700;color:#475569">Overall</span>
            <span style="font-size:12px;font-weight:700;color:#6366f1">${stats.total ? formatPercent((Object.values(stats.encryptedCounts || {}).reduce((a, b) => a + b, 0)) / stats.total) : '0%'}</span>
          </div>
        </div>

        <!-- Top Active APIs -->
        ${stats.topChanged?.length ? `
        <div style="margin-bottom:28px">
          <div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:12px">🔄 Most Active APIs This Week</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
            <tr style="background:#f8fafc">
              <th style="text-align:left;padding:10px 16px;font-size:12px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">API Name</th>
              <th style="text-align:center;padding:10px 16px;font-size:12px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0;width:80px">Env</th>
              <th style="text-align:center;padding:10px 16px;font-size:12px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0;width:60px">Hits</th>
              <th style="text-align:center;padding:10px 16px;font-size:12px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0;width:100px">Jira</th>
            </tr>
            ${apiRows}
          </table>
        </div>` : ''}

        <!-- Top Domains -->
        ${domainRows ? `
        <div style="margin-bottom:28px">
          <div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:12px">🌐 Top Domains</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
            <tr style="background:#f8fafc">
              <th style="text-align:left;padding:10px 16px;font-size:12px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Domain</th>
              <th style="text-align:center;padding:10px 16px;font-size:12px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0;width:60px">Count</th>
              <th style="text-align:left;padding:10px 16px;font-size:12px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Share</th>
              <th style="text-align:center;padding:10px 16px;font-size:12px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0;width:80px">Pct</th>
            </tr>
            ${domainRows}
          </table>
        </div>` : ''}

        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;margin-top:8px">
          <tr>
            <td style="padding:20px 0;text-align:center">
              <div style="font-size:12px;color:#94a3b8;line-height:1.6">
                <strong style="color:#64748b">AMLI Ecosystem Tools</strong> · Automated Weekly Report<br>
                Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} IST<br>
                <span style="color:#cbd5e1">Next report: Monday 9:00 AM IST</span>
              </div>
            </td>
          </tr>
        </table>

      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;
}

async function sendEmail(html) {
  if (!SENDGRID_API_KEY) {
    console.log('SENDGRID_API_KEY not set — printing digest to stdout instead of mailing');
    console.log('=== DIGEST HTML (truncated) ===');
    console.log(html.slice(0, 2000));
    return;
  }
  const payload = {
    personalizations: [{ to: [{ email: DIGEST_RECIPIENT }] }],
    subject: `📊 Weekly Ecosystem Digest — ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}`,
    content: [{ type: 'text/html', value: html }],
  };
  if (DIGEST_FROM) payload.from = { email: DIGEST_FROM };
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SendGrid error ${res.status}: ${text}`);
  }
  console.log('Digest email sent to', DIGEST_RECIPIENT);
}

const handler = async (event) => {
  if (event.httpMethod !== 'GET' && event.source !== 'schedule') {
    return { statusCode: 405, body: 'Only GET or schedule supported' };
  }

  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekAgoIso = weekAgo.toISOString();

    const countSnap = await db.collection('artifacts').count().get();
    const total = countSnap.data().count || 0;

    const envCounts = {};
    const encryptedCounts = {};
    const domainCounts = {};
    const envSnap = await db.collection('artifacts')
      .select('env', 'encryption', 'apiName', 'jiraTicket', 'timestamp', 'url')
      .orderBy('timestamp', 'desc')
      .limit(10000)
      .get();

    let newThisWeek = 0;
    const changedMap = {};

    for (const d of envSnap.docs) {
      const data = d.data();
      const env = data.env || 'DEV';
      envCounts[env] = (envCounts[env] || 0) + 1;
      if (data.encryption === 'Enabled') {
        encryptedCounts[env] = (encryptedCounts[env] || 0) + 1;
      }
      if (data.url) {
        try {
          const host = new URL(data.url).hostname;
          domainCounts[host] = (domainCounts[host] || 0) + 1;
        } catch {}
      }
      const ts = data.timestamp?.toDate?.();
      if (ts && ts >= weekAgo) {
        newThisWeek++;
        const key = data.apiName + '|' + env;
        if (!changedMap[key]) {
          changedMap[key] = { apiName: data.apiName, env, jiraTicket: data.jiraTicket, count: 0 };
        }
        changedMap[key].count++;
      }
    }

    const encryptionRates = {};
    for (const e of ['DEV', 'UAT', 'PROD']) {
      encryptionRates[e] = envCounts[e] ? (encryptedCounts[e] || 0) / envCounts[e] : 0;
    }

    const topChanged = Object.values(changedMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const credSnap = await db.collection('credentials').count().get();
    const newCredentials = credSnap.data().count || 0;

    const previous = await getPreviousSnapshot();

    const stats = {
      total,
      envCounts,
      encryptedCounts,
      encryptionRates,
      domainCounts,
      newThisWeek,
      newCredentials,
      topChanged,
      weekRange: `${weekAgo.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} — ${now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
      lastWeek: previous,
    };

    const aiSummary = await generateAiSummary(stats);
    const html = buildHtmlEmail(stats, aiSummary);
    await sendEmail(html);
    await saveSnapshot(stats);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, sent: true, total, newThisWeek }),
    };
  } catch (err) {
    console.error('Digest error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

module.exports = { handler };
