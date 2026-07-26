import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { SYSTEM_PROMPTS } from './ai/prompts';
import useAI from './ai/useAI';
import { aiAvailable } from './ai/gemini';
import { logAnalyticsEvent } from './firebase';
import './QuickAnswerBot.css';

const FAQ = [
  { q: 'What is AES-GCM?', a: 'AES-GCM (Galois/Counter Mode) provides authenticated encryption — it encrypts data AND verifies integrity. It uses a 12-byte random IV and produces a 16-byte auth tag. Recommended for most use cases.', keywords: ['gcm', 'galois counter', 'authenticated encryption', 'aes-gcm'] },
  { q: 'What is AES-CBC?', a: 'AES-CBC (Cipher Block Chaining) encrypts each block XORed with the previous ciphertext. It requires PKCS#7 padding and does NOT provide authentication. Use GCM when possible.', keywords: ['cbc', 'cipher block chaining', 'block cipher', 'aes-cbc', 'pkcs'] },
  { q: 'What key format should I use?', a: 'GCM requires a Base64-encoded 256-bit key. CBC accepts a raw string of 16, 24, or 32 characters (128/192/256-bit). Use the Key Generator to create keys in both formats.', keywords: ['key format', 'key length', 'base64 key', 'hex key', 'raw key', 'key size'] },
  { q: 'How do artifacts work?', a: 'Artifacts package API documentation (curl, response, encryption) into structured text files. They generate two ZIPs: original + masked (sensitive data hidden). Saved to the library for later reference.', keywords: ['how artifact', 'what is artifact', 'artifact work', 'artifact generation', 'create artifact', 'artifact file'] },
  { q: 'How do I find a curl command?', a: 'Go to the Library page, search for the API name or Jira ticket, then click the 📋 icon on the artifact row to copy its curl command. You can also download the full artifact ZIP.', keywords: ['show curl', 'find curl', 'get curl', 'copy curl', 'curl for', 'latest curl', 'policy360', 'policy 360'] },
  { q: 'What is AMLI Tools?', a: 'AMLI Tools is a suite of encryption, decryption, and SOA documentation tools. It includes a Cipher Tool (AES encrypt/decrypt), an Artifact Generator (structured API docs + ZIPs), and an API Library (searchable artifact history).', keywords: ['amli', 'what is amli', 'what does amli', 'tool suite', 'amli tools purpose', 'use of amli'] },
  { q: 'What is the library password?', a: 'The library password is set via the VITE_LIBRARY_PASSWORD environment variable. Ask your admin if you don\'t have it.', keywords: ['library password', 'library access', 'unlock library', 'login library'] },
  { q: 'What is the Cipher Tool?', a: 'The Cipher Tool provides AES-256 encryption and decryption in GCM and CBC modes. It runs entirely in your browser using the Web Crypto API — no data ever leaves your machine.', keywords: ['cipher tool', 'encrypt tool', 'decrypt tool', 'encryption page', 'crypto tool'] },
  { q: 'What is the Artifact Generator?', a: 'The Artifact Generator creates structured SOA documentation packages from curl commands, API responses, and encryption details. It produces downloadable ZIP archives and saves them to the library.', keywords: ['artifact generator', 'artifact page', 'new artifact', 'artifact form', 'create artifact'] },
  { q: 'How do I compare artifacts?', a: 'In the Library page, check the box next to two artifacts and click the "Compare" button. You\'ll see a side-by-side field diff. Click "AI Summary" for a semantic change analysis.', keywords: ['compare artifact', 'compare two', 'artifact diff', 'artifact difference', 'side by side'] },
  { q: 'How do I search the library?', a: 'Use the search bar in the Library page to filter by API name or Jira ticket. You can also sort by date. Use the Insights button for aggregate analytics.', keywords: ['search library', 'find artifact', 'find api', 'search artifact', 'library search'] },
];

function findBestMatch(question) {
  const q = question.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const faq of FAQ) {
    let score = 0;
    if (q.includes(faq.q.toLowerCase())) {
      score = 15;
    }
    for (const kw of faq.keywords) {
      if (q.includes(kw)) score += 4;
    }
    if (score > bestScore) {
      bestScore = score;
      best = faq;
    }
  }
  return bestScore >= 4 ? best : null;
}

export default function QuickAnswerBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const { callAI, aiLoading } = useAI();
  const chatRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  const handleFAQClick = (faq) => {
    logAnalyticsEvent('faq_click', { faq_question: faq.q });
    setMessages(prev => [...prev, { role: 'user', text: faq.q }, { role: 'bot', text: faq.a }]);
    setOpen(true);
  };

  const handleAsk = async () => {
    if (!input.trim() || aiLoading) return;
    const question = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: question }]);
    setMessages(prev => [...prev, { role: 'bot', text: '...', loading: true }]);

    const pageContext = {
      '/': 'Home page',
      '/cipher': 'Cipher Tool (encryption/decryption)',
      '/artifacts': 'Artifact Generator',
      '/library': 'API Library'
    }[location.pathname] || 'Unknown page';

    if (aiAvailable) {
      const result = await callAI(
        `The user is on the ${pageContext} page.\n\nQuestion: ${question}`,
        SYSTEM_PROMPTS.quickAnswerBot,
        0.3
      );
      if (result) {
        logAnalyticsEvent('ai_answer_returned', { answer_length: result.length, page_context: location.pathname });
        setMessages(prev => prev.filter(m => !m.loading).concat({ role: 'bot', text: result }));
        return;
      }
    }

    const match = findBestMatch(question);
    const answer = match
      ? match.a
      : 'I\'m not sure about that. Try one of the FAQ topics above, or set VITE_GROQ_API_KEY for AI-powered answers.';
    logAnalyticsEvent('ai_fallback_to_faq', { question_length: question.length, page_context: location.pathname, faq_matched: !!match });
    setMessages(prev => prev.filter(m => !m.loading).concat({ role: 'bot', text: answer }));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  return (
    <>
      <button className={`qab-fab ${open ? 'qab-fab--open' : ''}`} onClick={() => setOpen(!open)}>
        {open ? '✕' : '💬'}
      </button>

      {open && (
        <div className="qab-panel">
          <div className="qab-header">
            <span>AI Assistant</span>
            {aiAvailable && <span className="qab-ai-badge">AI</span>}
          </div>

          <div className="qab-chat" ref={chatRef}>
            {messages.length === 0 && (
              <div className="qab-welcome">
                <strong>Ask me anything about AMLI Tools</strong>
                <div className="qab-faq-chips">
                  {FAQ.map((faq, i) => (
                    <button key={i} className="qab-chip" onClick={() => handleFAQClick(faq)}>
                      {faq.q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`qab-msg qab-msg--${msg.role}`}>
                <div className="qab-msg-text">
                  {msg.loading ? <div className="loader tiny" style={{ margin: 0 }} /> : msg.text}
                </div>
              </div>
            ))}
          </div>

          <div className="qab-input-row">
            <textarea
              className="qab-input"
              placeholder="Ask a question..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <button className="qab-send" onClick={handleAsk} disabled={aiLoading || !input.trim()}>
              {aiLoading ? <div className="loader tiny" /> : '→'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
