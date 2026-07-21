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
const DIGEST_FROM = process.env.DIGEST_FROM || 'amli-digest@amliaes.netlify.app';
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
  return `<span style="color:${color};font-size:0.85rem;margin-left:6px">${arrow} ${Math.abs(diff).toFixed(1)}%</span>`;
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
    const prompt = `You are a technical lead writing a brief weekly ecosystem summary. Given these stats, write 2-3 concise bullet points highlighting key trends, concerns, and achievements. Be direct and data-driven. Stats: ${JSON.stringify(stats)}`;
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
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
  const rows = stats.topChanged?.map(a => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600">${a.apiName || 'Unknown'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee"><span class="env-badge" style="background:${a.env === 'PROD' ? '#ef4444' : a.env === 'UAT' ? '#f59e0b' : '#3b82f6'};color:#fff;padding:2px 8px;border-radius:4px;font-size:0.8rem">${a.env}</span></td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666">${a.jiraTicket || '—'}</td>
    </tr>
  `).join('') || '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;margin:0;padding:0">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
      <tr>
        <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:40px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:28px;font-weight:700">📊 Weekly Ecosystem Digest</h1>
          <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px">${stats.weekRange}</p>
        </td>
      </tr>
      <tr><td style="padding:32px">

        ${aiSummary ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin-bottom:24px">
          <tr><td style="font-size:14px;color:#166534;line-height:1.6">${aiSummary.replace(/\n/g, '<br>')}</td></tr>
        </table>` : ''}

        <h2 style="font-size:18px;margin:0 0 16px;color:#333">📈 Overview</h2>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="33%" style="text-align:center;padding:16px;background:#f8fafc;border-radius:12px">
              <div style="font-size:32px;font-weight:700;color:#6366f1">${stats.total}</div>
              <div style="font-size:12px;color:#888;margin-top:4px">Total Artifacts${formatTrend(stats.total, lastWeek?.total)}</div>
            </td>
            <td width="33%" style="text-align:center;padding:16px">
              <div style="font-size:32px;font-weight:700;color:#22c55e">${stats.newThisWeek}</div>
              <div style="font-size:12px;color:#888;margin-top:4px">Added This Week</div>
            </td>
            <td width="33%" style="text-align:center;padding:16px;background:#f8fafc;border-radius:12px">
              <div style="font-size:32px;font-weight:700;color:#f59e0b">${stats.newCredentials}</div>
              <div style="font-size:12px;color:#888;margin-top:4px">Credentials Found</div>
            </td>
          </tr>
        </table>

        <h2 style="font-size:18px;margin:24px 0 16px;color:#333">🌍 Per-Environment Breakdown</h2>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <tr style="background:#f8fafc">
            <th style="text-align:left;padding:10px 12px;font-size:13px;color:#666;border-bottom:2px solid #eee">Env</th>
            <th style="text-align:center;padding:10px 12px;font-size:13px;color:#666;border-bottom:2px solid #eee">Count</th>
            <th style="text-align:center;padding:10px 12px;font-size:13px;color:#666;border-bottom:2px solid #eee">Encrypted</th>
            <th style="text-align:center;padding:10px 12px;font-size:13px;color:#666;border-bottom:2px solid #eee">Coverage</th>
          </tr>
          ${['DEV', 'UAT', 'PROD'].map(e => `
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #eee;font-weight:600">${e}</td>
            <td style="text-align:center;padding:10px 12px;border-bottom:1px solid #eee">${stats.envCounts?.[e] || 0}</td>
            <td style="text-align:center;padding:10px 12px;border-bottom:1px solid #eee">${stats.encryptedCounts?.[e] || 0}</td>
            <td style="text-align:center;padding:10px 12px;border-bottom:1px solid #eee">${formatPercent(stats.encryptionRates?.[e] || 0)}</td>
          </tr>`).join('')}
        </table>

        ${stats.topChanged?.length ? `
        <h2 style="font-size:18px;margin:24px 0 16px;color:#333">🔄 Most Active APIs This Week</h2>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <tr style="background:#f8fafc">
            <th style="text-align:left;padding:10px 12px;font-size:13px;color:#666;border-bottom:2px solid #eee">API Name</th>
            <th style="text-align:center;padding:10px 12px;font-size:13px;color:#666;border-bottom:2px solid #eee">Env</th>
            <th style="text-align:center;padding:10px 12px;font-size:13px;color:#666;border-bottom:2px solid #eee">Jira</th>
          </tr>
          ${rows}
        </table>` : ''}

        <p style="text-align:center;margin-top:32px;font-size:12px;color:#aaa;border-top:1px solid #eee;padding-top:16px">
          AMLI Tools · Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
        </p>
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
    from: { email: DIGEST_FROM },
    subject: `📊 Weekly Ecosystem Digest — ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}`,
    content: [{ type: 'text/html', value: html }],
  };
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
    const envSnap = await db.collection('artifacts')
      .select('env', 'encryption', 'apiName', 'jiraTicket', 'timestamp')
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
