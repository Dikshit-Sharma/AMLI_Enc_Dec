const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODEL = 'gemini-pro';

export const aiAvailable = !!GEMINI_API_KEY;

export async function askGemini(prompt, systemPrompt = '', temperature = 0.2) {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured. Set VITE_GEMINI_API_KEY in .env');
  }

  const fullPrompt = systemPrompt
    ? `${systemPrompt}\n\n---\n${prompt}`
    : prompt;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig: { temperature, maxOutputTokens: 2048 }
      })
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.error('[Gemini] API error:', response.status, err);
    throw new Error(`Gemini API error (${response.status}): ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) {
    const reason = data.promptFeedback?.blockReason || 'unknown';
    console.error('[Gemini] Empty response:', data);
    throw new Error(`Gemini returned empty response (block reason: ${reason})`);
  }
  return text;
}
