const PROXY_URL = '/api/groq-proxy';

export const aiAvailable = true;

export async function askGroq(prompt, systemPrompt = '', temperature = 0.2) {
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const apiKey = import.meta.env.VITE_API_KEY || '';
  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
    },
    body: JSON.stringify({
      messages,
      temperature,
      max_tokens: 2048,
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error('AI service temporarily unavailable');
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) {
    throw new Error('AI returned empty response');
  }
  return text;
}

export { askGroq as askGemini };
