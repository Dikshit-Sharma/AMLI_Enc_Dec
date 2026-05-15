const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const MODEL = 'llama-3.3-70b-versatile';
const BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';

export const aiAvailable = !!GROQ_API_KEY;

export async function askGroq(prompt, systemPrompt = '', temperature = 0.2) {
  if (!GROQ_API_KEY) {
    throw new Error('Groq API key not configured. Set VITE_GROQ_API_KEY in .env');
  }

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature,
      max_tokens: 2048
    })
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('[Groq] API error:', response.status, err);
    throw new Error(`Groq API error (${response.status}): ${err.slice(0, 300)}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) {
    console.error('[Groq] Empty response:', data);
    throw new Error('Groq returned empty response');
  }
  return text;
}

export { askGroq as askGemini };
