// Proxy for GitLab API — avoids CORS/Private Network Access restrictions
// when the GitLab instance is on an internal/corporate network.

export default async (req) => {
  const headers = { 'Access-Control-Allow-Origin': '*' };

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...headers,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }

  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }

  const { target, token } = body;
  if (!target || !token) {
    return new Response(JSON.stringify({ error: 'Missing "target" or "token"' }), {
      status: 400,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }

  try {
    const res = await fetch(target, {
      headers: { 'PRIVATE-TOKEN': token },
    });

    const text = await res.text();

    let data;
    try { data = JSON.parse(text); } catch { data = text; }

    return new Response(JSON.stringify({ status: res.status, data }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }
};
