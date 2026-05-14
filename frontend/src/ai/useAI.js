import { useState, useCallback, useRef } from 'react';
import { askGemini as askAI, aiAvailable } from './gemini';

export default function useAI() {
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const abortRef = useRef(null);

  const callAI = useCallback(async (prompt, systemPrompt = '', temperature = 0.2) => {
    if (!aiAvailable) {
      const msg = 'AI not available — set VITE_GROQ_API_KEY in .env';
      setAiError(msg);
      console.warn('[AI]', msg);
      return null;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAiLoading(true);
    setAiError(null);

    try {
      const result = await askAI(prompt, systemPrompt, temperature);
      return result;
    } catch (err) {
      if (err.name === 'AbortError') return null;
      console.error('[AI] API call failed:', err.message);
      setAiError(err.message);
      return null;
    } finally {
      setAiLoading(false);
    }
  }, []);

  return { callAI, aiLoading, aiError, aiAvailable };
}
