const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-pro',
];

const API_VERSIONS = ['v1', 'v1beta'];

export const aiAvailable = !!GEMINI_API_KEY;

export async function askGemini(prompt, systemPrompt = '', temperature = 0.2) {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured. Set VITE_GEMINI_API_KEY in .env');
  }

  const fullPrompt = systemPrompt
    ? `${systemPrompt}\n\n---\n${prompt}`
    : prompt;

  let lastError = null;

  for (const version of API_VERSIONS) {
    for (const model of MODELS) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
              generationConfig: { temperature, maxOutputTokens: 2048 }
            })
          }
        );

        if (response.ok) {
          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (text) return text;
          const reason = data.promptFeedback?.blockReason || 'unknown';
          throw new Error(`Gemini returned empty response (block reason: ${reason})`);
        }

        const errBody = await response.text();
        console.warn(`[Gemini] ${version}/models/${model} (${response.status})`);
        lastError = `${version}/models/${model}: HTTP ${response.status} — ${errBody.slice(0, 150)}`;
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        console.warn(`[Gemini] ${version}/models/${model} error:`, e.message);
        lastError = `${version}/models/${model}: ${e.message}`;
      }
    }
  }

  throw new Error(`Gemini API error — all attempts failed. Last: ${lastError}`);
}

export async function listGeminiModels() {
  if (!GEMINI_API_KEY) return [];
  const results = [];
  for (const version of API_VERSIONS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/${version}/models?key=${GEMINI_API_KEY}`
      );
      if (res.ok) {
        const data = await res.json();
        results.push(...(data.models?.map(m => `${version}:${m.name}`) || []));
      }
      } catch { /* skip unavailable versions */ }
  }
  return results;
}
