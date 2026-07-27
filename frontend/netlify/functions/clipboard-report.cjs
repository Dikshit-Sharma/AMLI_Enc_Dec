const CONVEX_URL = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL || '';
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const DIGEST_FROM = process.env.DIGEST_FROM || 'dikshit.sharma2580@gmail.com';
const DIGEST_RECIPIENT = process.env.DIGEST_RECIPIENT || 'dikshit.sharma2580@gmail.com';
const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || '';

async function fetchConvexAll() {
  if (!CONVEX_URL) throw new Error('CONVEX_URL not set');
  const res = await fetch(`${CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: 'clipboards:getAll', args: {} }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Convex query failed ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.value || [];
}

function daysSince(date) {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function timeAgo(date) {
  const d = daysSince(date);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  if (d < 30) return `${Math.floor(d / 7)} week${Math.floor(d / 7) > 1 ? 's' : ''} ago`;
  return `${Math.floor(d / 30)} month${Math.floor(d / 30) > 1 ? 's' : ''} ago`;
}

async function sendEmail(html, subject) {
  if (!SENDGRID_API_KEY) {
    console.log('SENDGRID_API_KEY not set — printing clipboard report to stdout');
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

async function generateAiSummary(stats) {
  if (!GROQ_API_KEY) return null;
  try {
    const prompt = `You are a data analyst writing a weekly clipboard usage summary. Be concise and actionable.

Write a structured summary with these exact sections using plain text:

SECTION 1 - HIGHLIGHTS (2-3 bullet points):
- Total clipboards and recent growth
- Most active clipboards
- Any notable patterns

SECTION 2 - HEALTH CHECK (2-3 bullet points):
- Dead clipboards needing cleanup
- Unused or abandoned clipboards
- Recommendations

SECTION 3 - OUTLOOK:
- One sentence on overall clipboard ecosystem health

Stats:
- Total clipboards: ${stats.total}
- Created last 7 days: ${stats.newLast7Days}
- Active (updated in 7d): ${stats.activeLast7Days}
- Most used (by version count): ${stats.mostUsed.map(c => `${c.title} (v${c.version})`).join(', ') || 'None'}
- Least used (0 or 1 edits): ${stats.leastUsed.length}
- Dead (30+ days inactive): ${stats.deadClipboards.length}
- Avg age in days: ${stats.avgAgeDays}
- Total content size: ${stats.totalContentSizeKB}KB`;
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
      }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (_) {
    return null;
  }
}

function buildReportHtml(stats, aiSummary) {
  const { total, newLast7Days, activeLast7Days, mostUsed, leastUsed, deadClipboards, avgAgeDays, totalContentSizeKB, oldestClipboards, reportDate } = stats;

  const mostUsedRows = mostUsed.map((c, i) => `
    <tr style="${i % 2 === 0 ? 'background:#fafafa' : ''}">
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-weight:600;font-size:14px">${c.title || 'Untitled'}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;text-align:center;font-weight:700;color:#6366f1">${c.version}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#666;font-family:monospace">${c.id}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#666">${c.lastUpdatedAgo}</td>
    </tr>
  `).join('');

  const leastUsedRows = leastUsed.slice(0, 10).map((c, i) => `
    <tr style="${i % 2 === 0 ? 'background:#fafafa' : ''}">
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-weight:600;font-size:14px">${c.title || 'Untitled'}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;text-align:center;font-weight:700;color:#f59e0b">${c.version}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#666;font-family:monospace">${c.id}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#666">${c.lastUpdatedAgo}</td>
    </tr>
  `).join('');

  const deadRows = deadClipboards.slice(0, 10).map((c, i) => `
    <tr style="${i % 2 === 0 ? 'background:#fafafa' : ''}">
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-weight:600;font-size:14px">${c.title || 'Untitled'}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;text-align:center;font-weight:700;color:#ef4444">${c.daysInactive}d</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#666;font-family:monospace">${c.id}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f0f2f5;margin:0;padding:0">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px">
    <table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08)">

      <tr>
        <td style="background:linear-gradient(135deg,#f59e0b 0%,#f97316 50%,#ef4444 100%);padding:40px 40px;text-align:center">
          <div style="font-size:38px;margin-bottom:8px">📋</div>
          <h1 style="color:#fff;margin:0 0 6px;font-size:24px;font-weight:800;letter-spacing:-0.5px">Clipboard Analytics</h1>
          <p style="color:rgba(255,255,255,0.85);margin:0;font-size:13px">Weekly Usage Report</p>
          <div style="margin-top:14px;display:inline-block;background:rgba(255,255,255,0.15);padding:6px 18px;border-radius:20px;font-size:12px;color:#fff">
            📅 ${reportDate}
          </div>
        </td>
      </tr>

      <tr><td style="padding:32px 40px">

        <div style="margin-bottom:20px;font-size:14px;color:#1e293b;line-height:1.7">
          Hi there 👋,<br><br>
          Here's your <strong>Clipboard Analytics</strong> report for <strong>${reportDate}</strong>. This covers all clipboards, usage patterns, and health metrics.
        </div>

        <!-- Quick Stats -->
        <div style="display:flex;gap:12px;margin-bottom:24px">
          <div style="flex:1;background:linear-gradient(135deg,#eff6ff,#dbeafe);border-radius:12px;padding:18px;text-align:center">
            <div style="font-size:32px;font-weight:800;color:#3b82f6">${total}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;text-transform:uppercase;letter-spacing:0.5px">Total Clipboards</div>
          </div>
          <div style="flex:1;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-radius:12px;padding:18px;text-align:center">
            <div style="font-size:32px;font-weight:800;color:#22c55e">${newLast7Days}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;text-transform:uppercase;letter-spacing:0.5px">New (7 days)</div>
          </div>
          <div style="flex:1;background:linear-gradient(135deg,#fefce8,#fef9c3);border-radius:12px;padding:18px;text-align:center">
            <div style="font-size:32px;font-weight:800;color:#f59e0b">${activeLast7Days}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;text-transform:uppercase;letter-spacing:0.5px">Active (7 days)</div>
          </div>
          <div style="flex:1;background:linear-gradient(135deg,${deadClipboards.length > 0 ? '#fef2f2,#fee2e2' : '#f0fdf4,#dcfce7'});border-radius:12px;padding:18px;text-align:center">
            <div style="font-size:32px;font-weight:800;color:${deadClipboards.length > 0 ? '#ef4444' : '#22c55e'}">${deadClipboards.length}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;text-transform:uppercase;letter-spacing:0.5px">Dead (30d+)</div>
          </div>
        </div>

        <!-- Activity Summary -->
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:18px;margin-bottom:24px">
          <div style="font-size:14px;font-weight:700;color:#166534;margin-bottom:8px">📊 Activity Summary</div>
          <div style="font-size:13px;color:#166534;line-height:1.8">
            • <strong>${newLast7Days}</strong> new clipboard(s) created in the last 7 days<br>
            • <strong>${activeLast7Days}</strong> clipboard(s) actively edited in the last 7 days<br>
            • Average clipboard age: <strong>${avgAgeDays} days</strong><br>
            • Total content size: <strong>${totalContentSizeKB} KB</strong>
          </div>
        </div>

        <!-- Most Used -->
        ${mostUsedRows.length > 0 ? `
        <div style="margin-bottom:24px">
          <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:10px">🏆 Most Used Clipboards</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0">
            <tr style="background:#f8fafc">
              <th style="text-align:left;padding:8px 16px;font-size:11px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Title</th>
              <th style="text-align:center;padding:8px 16px;font-size:11px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0;width:60px">Edits</th>
              <th style="text-align:left;padding:8px 16px;font-size:11px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0;width:100px">ID</th>
              <th style="text-align:left;padding:8px 16px;font-size:11px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0;width:100px">Last Edit</th>
            </tr>
            ${mostUsedRows}
          </table>
        </div>` : ''}

        <!-- Least Used -->
        ${leastUsedRows.length > 0 ? `
        <div style="margin-bottom:24px">
          <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:10px">📉 Least Used Clipboards</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0">
            <tr style="background:#f8fafc">
              <th style="text-align:left;padding:8px 16px;font-size:11px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Title</th>
              <th style="text-align:center;padding:8px 16px;font-size:11px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0;width:60px">Edits</th>
              <th style="text-align:left;padding:8px 16px;font-size:11px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0;width:100px">ID</th>
              <th style="text-align:left;padding:8px 16px;font-size:11px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0;width:100px">Last Edit</th>
            </tr>
            ${leastUsedRows}
          </table>
        </div>` : ''}

        <!-- Dead Clipboards -->
        ${deadRows.length > 0 ? `
        <div style="margin-bottom:24px">
          <div style="font-size:15px;font-weight:700;color:#ef4444;margin-bottom:10px">💀 Dead Clipboards (30+ days inactive)</div>
          <div style="font-size:13px;color:#991b1b;margin-bottom:10px">These clipboards haven't been updated in over 30 days and may be candidates for deletion.</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:10px;overflow:hidden;border:1px solid #fecaca">
            <tr style="background:#fef2f2">
              <th style="text-align:left;padding:8px 16px;font-size:11px;color:#991b1b;text-transform:uppercase;border-bottom:2px solid #fecaca">Title</th>
              <th style="text-align:center;padding:8px 16px;font-size:11px;color:#991b1b;text-transform:uppercase;border-bottom:2px solid #fecaca;width:80px">Inactive</th>
              <th style="text-align:left;padding:8px 16px;font-size:11px;color:#991b1b;text-transform:uppercase;border-bottom:2px solid #fecaca;width:100px">ID</th>
            </tr>
            ${deadRows}
          </table>
        </div>` : `
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:18px;margin-bottom:24px">
          <div style="font-size:14px;font-weight:700;color:#166534;margin-bottom:6px">✅ No Dead Clipboards</div>
          <div style="font-size:13px;color:#166534">All clipboards have been updated within the last 30 days. Great activity!</div>
        </div>`}

        <!-- AI Summary -->
        ${aiSummary ? `
        <div style="background:linear-gradient(135deg,#eff6ff,#eef2ff);border:1px solid #c7d2fe;border-radius:12px;padding:20px;margin-bottom:24px">
          <div style="font-size:14px;font-weight:700;color:#4338ca;margin-bottom:10px">🤖 AI Insights</div>
          <div style="font-size:13px;color:#1e293b;line-height:1.7;white-space:pre-line">${aiSummary}</div>
        </div>` : ''}

        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;margin-top:8px">
          <tr>
            <td style="padding:16px 0;text-align:center">
              <div style="font-size:11px;color:#94a3b8;line-height:1.6">
                <strong style="color:#64748b">AMLI Ecosystem Tools</strong> · Clipboard Analytics Report<br>
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
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const rows = await fetchConvexAll();
    const clipboards = rows.map((r) => {
      const created = r.createdAt ? new Date(r.createdAt) : null;
      const updated = r.updatedAt ? new Date(r.updatedAt) : null;
      const effectiveUpdated = updated || created;
      return {
        id: r.id,
        title: r.title || 'Untitled',
        version: r.version || 0,
        contentLength: r.contentLength || 0,
        createdAt: created,
        updatedAt: effectiveUpdated,
      };
    });

    const total = clipboards.length;
    const newLast7Days = clipboards.filter(c => c.createdAt && c.createdAt >= weekAgo).length;
    const activeLast7Days = clipboards.filter(c => c.updatedAt && c.updatedAt >= weekAgo).length;
    const activeLast30Days = clipboards.filter(c => c.updatedAt && c.updatedAt >= thirtyDaysAgo).length;

    const withAge = clipboards.filter(c => c.createdAt).map(c => ({
      ...c,
      ageDays: daysSince(c.createdAt),
    }));
    const avgAgeDays = withAge.length > 0
      ? Math.round(withAge.reduce((s, c) => s + c.ageDays, 0) / withAge.length)
      : 0;

    const totalContentSizeKB = Math.round(clipboards.reduce((s, c) => s + c.contentLength, 0) / 1024);

    const sortedByVersionDesc = [...clipboards].sort((a, b) => b.version - a.version);
    const mostUsed = sortedByVersionDesc.slice(0, 10).map(c => ({
      ...c,
      lastUpdatedAgo: c.updatedAt ? timeAgo(c.updatedAt) : 'never',
    }));

    const sortedByVersionAsc = [...clipboards].filter(c => c.version <= 1).sort((a, b) => a.version - b.version || (a.updatedAt || 0) - (b.updatedAt || 0));
    const leastUsed = sortedByVersionAsc.slice(0, 10).map(c => ({
      ...c,
      lastUpdatedAgo: c.updatedAt ? timeAgo(c.updatedAt) : 'never',
    }));

    const deadClipboards = clipboards
      .filter(c => !c.updatedAt || c.updatedAt < thirtyDaysAgo)
      .map(c => ({
        ...c,
        daysInactive: c.updatedAt ? daysSince(c.updatedAt) : avgAgeDays,
      }))
      .sort((a, b) => b.daysInactive - a.daysInactive)
      .slice(0, 10);

    const stats = {
      total,
      newLast7Days,
      activeLast7Days,
      activeLast30Days,
      mostUsed,
      leastUsed,
      deadClipboards,
      avgAgeDays,
      totalContentSizeKB,
      reportDate: now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
    };

    const aiSummary = await generateAiSummary(stats);
    const html = buildReportHtml(stats, aiSummary);
    const subject = `📋 Clipboard Analytics — ${stats.reportDate}`;
    const sent = await sendEmail(html, subject);

    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        sent: !!sent,
        stats: {
          total,
          newLast7Days,
          activeLast7Days,
          activeLast30Days,
          deadClipboards: deadClipboards.length,
          avgAgeDays,
          totalContentSizeKB,
        },
      }),
    };
  } catch (err) {
    console.error('Clipboard report error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

module.exports = { handler };
