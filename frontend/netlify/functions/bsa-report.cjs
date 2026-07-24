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

function barHtml(pct, color) {
  return `<div style="background:#eee;border-radius:4px;height:8px;width:100%"><div style="background:${color};height:8px;border-radius:4px;width:${Math.min(100, pct).toFixed(1)}%"></div></div>`;
}

function formatTs(ts) {
  if (!ts) return null;
  try {
    if (ts.seconds) return new Date(ts.seconds * 1000);
    if (ts._seconds) return new Date(ts._seconds * 1000);
    if (ts.toDate) return ts.toDate();
    return new Date(ts);
  } catch { return null; }
}

async function sendEmail(html, subject) {
  if (!SENDGRID_API_KEY) {
    console.log('SENDGRID_API_KEY not set — printing BSA report to stdout');
    console.log(html.slice(0, 2000));
    return false;
  }
  const payload = {
    personalizations: [{ to: [{ email: DIGEST_RECIPIENT }] }],
    subject,
    content: [{ type: 'text/html', value: html }],
  };
  if (DIGEST_FROM) payload.from = { email: DIGEST_FROM };
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SendGrid error ${res.status}: ${text}`);
  }
  return true;
}

function buildReportHtml(stats) {
  const { totalApis, totalConsumers, newApis, newConsumers, conflicts, topStakeholders, apiConsumerRows, consumerApiRows } = stats;

  const stakeholderPills = topStakeholders.map(s =>
    `<span style="display:inline-block;padding:4px 12px;border-radius:20px;background:#eff6ff;border:1px solid #bfdbfe;font-size:13px;font-weight:600;color:#3b82f6;margin:2px 4px">${s.name} <span style="background:#3b82f6;color:#fff;border-radius:50%;padding:1px 6px;font-size:11px;margin-left:4px">${s.apis.length}</span></span>`
  ).join('');

  const apiTableRows = apiConsumerRows.map((r, i) => `
    <tr style="${i % 2 === 0 ? 'background:#fafafa' : ''}">
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-weight:600;font-size:14px">${r.api}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;text-align:center;font-weight:700;color:#6366f1">${r.consumerCount}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#666">${r.consumers}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;text-align:center">${r.hasConflict ? '<span style="background:#fef3c7;color:#b45309;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">⚠ Yes</span>' : '<span style="color:#22c55e">✓</span>'}</td>
    </tr>
  `).join('');

  const consumerTableRows = consumerApiRows.slice(0, 15).map((r, i) => `
    <tr style="${i % 2 === 0 ? 'background:#fafafa' : ''}">
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-weight:600;font-size:14px">${r.consumer}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;text-align:center;font-weight:700;color:#6366f1">${r.apiCount}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#666">${r.apis}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-size:13px">${r.spoc || '—'}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f0f2f5;margin:0;padding:0">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px">
    <table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08)">

      <tr>
        <td style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#a855f7 100%);padding:40px 40px;text-align:center">
          <div style="font-size:38px;margin-bottom:8px">📊</div>
          <h1 style="color:#fff;margin:0 0 6px;font-size:24px;font-weight:800;letter-spacing:-0.5px">BSA Report</h1>
          <p style="color:rgba(255,255,255,0.85);margin:0;font-size:13px">Business Stakeholder Alignment</p>
          <div style="margin-top:14px;display:inline-block;background:rgba(255,255,255,0.15);padding:6px 18px;border-radius:20px;font-size:12px;color:#fff">
            📅 ${stats.reportDate}
          </div>
        </td>
      </tr>

      <tr><td style="padding:32px 40px">

        <div style="margin-bottom:20px;font-size:14px;color:#1e293b;line-height:1.7">
          Hi there 👋,<br><br>
          Here's your <strong>BSA Report</strong> for <strong>${stats.reportDate}</strong>. This covers all tracked API-consumer mappings, SPOC assignments, and stakeholder activity.
        </div>

        <!-- Quick Stats -->
        <div style="display:flex;gap:12px;margin-bottom:24px">
          <div style="flex:1;background:linear-gradient(135deg,#eff6ff,#dbeafe);border-radius:12px;padding:18px;text-align:center">
            <div style="font-size:32px;font-weight:800;color:#3b82f6">${totalApis}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;text-transform:uppercase;letter-spacing:0.5px">Total APIs</div>
            ${newApis > 0 ? `<div style="margin-top:4px;font-size:11px;color:#22c55e;font-weight:600">+${newApis} new this week</div>` : ''}
          </div>
          <div style="flex:1;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-radius:12px;padding:18px;text-align:center">
            <div style="font-size:32px;font-weight:800;color:#22c55e">${totalConsumers}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;text-transform:uppercase;letter-spacing:0.5px">Total Consumers</div>
            ${newConsumers > 0 ? `<div style="margin-top:4px;font-size:11px;color:#22c55e;font-weight:600">+${newConsumers} new this week</div>` : ''}
          </div>
          <div style="flex:1;background:linear-gradient(135deg,${conflicts > 0 ? '#fef2f2,#fee2e2' : '#f0fdf4,#dcfce7'});border-radius:12px;padding:18px;text-align:center">
            <div style="font-size:32px;font-weight:800;color:${conflicts > 0 ? '#ef4444' : '#22c55e'}">${conflicts}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;text-transform:uppercase;letter-spacing:0.5px">Conflicts</div>
          </div>
          <div style="flex:1;background:linear-gradient(135deg,#fefce8,#fef9c3);border-radius:12px;padding:18px;text-align:center">
            <div style="font-size:32px;font-weight:800;color:#f59e0b">${topStakeholders.length}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;text-transform:uppercase;letter-spacing:0.5px">Stakeholders</div>
          </div>
        </div>

        <!-- New Activity -->
        ${newApis > 0 || newConsumers > 0 ? `
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:18px;margin-bottom:24px">
          <div style="font-size:14px;font-weight:700;color:#166534;margin-bottom:8px">🆕 This Week's Activity</div>
          <div style="font-size:13px;color:#166534;line-height:1.7">
            ${newApis > 0 ? `• <strong>${newApis}</strong> new API(s) added to BSA<br>` : ''}
            ${newConsumers > 0 ? `• <strong>${newConsumers}</strong> new consumer(s) mapped to APIs<br>` : ''}
            ${newApis === 0 && newConsumers === 0 ? '• No new changes this week.' : ''}
          </div>
        </div>` : ''}

        <!-- Conflict Alert -->
        ${conflicts > 0 ? `
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:18px;margin-bottom:24px">
          <div style="font-size:14px;font-weight:700;color:#ef4444;margin-bottom:6px">⚠️ SPOC Conflicts Detected</div>
          <div style="font-size:13px;color:#991b1b;line-height:1.6">
            <strong>${conflicts}</strong> consumer(s) have different SPOCs across APIs. Resolve conflicts to ensure consistent stakeholder ownership.
          </div>
        </div>` : `
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:18px;margin-bottom:24px">
          <div style="font-size:14px;font-weight:700;color:#166534;margin-bottom:6px">✅ No SPOC Conflicts</div>
          <div style="font-size:13px;color:#166534">All consumers have consistent SPOC assignments across APIs.</div>
        </div>`}

        <!-- Top Stakeholders -->
        ${topStakeholders.length > 0 ? `
        <div style="margin-bottom:24px">
          <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:10px">🏆 Top Stakeholders</div>
          <div style="line-height:2">${stakeholderPills}</div>
        </div>` : ''}

        <!-- API-Consumer Table -->
        ${apiConsumerRows.length > 0 ? `
        <div style="margin-bottom:24px">
          <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:10px">📡 APIs & Consumers</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0">
            <tr style="background:#f8fafc">
              <th style="text-align:left;padding:8px 16px;font-size:11px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">API</th>
              <th style="text-align:center;padding:8px 16px;font-size:11px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0;width:60px">Count</th>
              <th style="text-align:left;padding:8px 16px;font-size:11px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Consumers</th>
              <th style="text-align:center;padding:8px 16px;font-size:11px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0;width:60px">Conflict</th>
            </tr>
            ${apiTableRows}
          </table>
        </div>` : ''}

        <!-- Consumer-API Table -->
        ${consumerTableRows.length > 0 ? `
        <div style="margin-bottom:24px">
          <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:10px">👤 Consumers & Their APIs</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0">
            <tr style="background:#f8fafc">
              <th style="text-align:left;padding:8px 16px;font-size:11px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Consumer</th>
              <th style="text-align:center;padding:8px 16px;font-size:11px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0;width:60px">APIs</th>
              <th style="text-align:left;padding:8px 16px;font-size:11px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Subscribed APIs</th>
              <th style="text-align:left;padding:8px 16px;font-size:11px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0;width:100px">SPOC</th>
            </tr>
            ${consumerTableRows}
          </table>
        </div>` : ''}

        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;margin-top:8px">
          <tr>
            <td style="padding:16px 0;text-align:center">
              <div style="font-size:11px;color:#94a3b8;line-height:1.6">
                <strong style="color:#64748b">AMLI Ecosystem Tools</strong> · BSA Report<br>
                Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} IST
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

const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const snapshot = await db.collection('bsa').orderBy('api', 'asc').limit(2000).get();
    const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const allConsumers = new Set();
    const consumerSpocMap = {};
    const apiConsumerMap = {};
    let conflicts = 0;

    entries.forEach(e => {
      apiConsumerMap[e.api] = [];
      (e.consumers || []).forEach(c => {
        allConsumers.add(c.name);
        apiConsumerMap[e.api].push(c);
        if (!consumerSpocMap[c.name]) consumerSpocMap[c.name] = new Set();
        if (c.spoc) consumerSpocMap[c.name].add(c.spoc);
      });
    });

    Object.values(consumerSpocMap).forEach(spocs => { if (spocs.size > 1) conflicts++; });

    let newApis = 0;
    let newConsumerNames = new Set();
    entries.forEach(e => {
      const created = formatTs(e.createdAt);
      if (created && created >= weekAgo) {
        newApis++;
        (e.consumers || []).forEach(c => newConsumerNames.add(c.name));
      }
      const updated = formatTs(e.updatedAt);
      if (updated && updated >= weekAgo) {
        (e.consumers || []).forEach(c => newConsumerNames.add(c.name));
      }
    });

    const topStakeholders = Object.entries(consumerSpocMap)
      .map(([name, spocs]) => {
        const apis = [];
        entries.forEach(e => {
          (e.consumers || []).forEach(c => { if (c.name === name) apis.push(e.api); });
        });
        return { name, spocs: [...spocs], apis };
      })
      .sort((a, b) => b.apis.length - a.apis.length)
      .slice(0, 10);

    const apiConsumerRows = entries.map(e => ({
      api: e.api,
      consumerCount: (e.consumers || []).length,
      consumers: (e.consumers || []).map(c => c.name).join(', '),
      hasConflict: (e.consumers || []).some(c => consumerSpocMap[c.name]?.size > 1),
    }));

    const consumerApiRows = [...allConsumers].map(name => {
      const apis = [];
      let spoc = '';
      entries.forEach(e => {
        (e.consumers || []).forEach(c => {
          if (c.name === name) { apis.push(e.api); if (c.spoc) spoc = c.spoc; }
        });
      });
      return { consumer: name, apiCount: apis.length, apis: apis.join(', '), spoc };
    }).sort((a, b) => b.apiCount - a.apiCount);

    const stats = {
      totalApis: entries.length,
      totalConsumers: allConsumers.size,
      newApis,
      newConsumers: newConsumerNames.size,
      conflicts,
      topStakeholders,
      apiConsumerRows,
      consumerApiRows,
      reportDate: now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
    };

    const html = buildReportHtml(stats);
    const subject = `📊 BSA Report — ${stats.reportDate}`;
    const sent = await sendEmail(html, subject);

    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, sent: !!sent, stats: { totalApis: stats.totalApis, totalConsumers: stats.totalConsumers, newApis: stats.newApis, newConsumers: stats.newConsumers, conflicts: stats.conflicts } }),
    };
  } catch (err) {
    console.error('BSA report error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

module.exports = { handler };
