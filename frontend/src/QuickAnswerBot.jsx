import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { SYSTEM_PROMPTS } from './ai/prompts';
import useAI from './ai/useAI';
import { aiAvailable } from './ai/gemini';
import './QuickAnswerBot.css';

const FAQ = [
  { q: 'What is AES-GCM?', a: 'AES-GCM (Galois/Counter Mode) provides authenticated encryption — it encrypts data AND verifies integrity. It uses a 12-byte random IV and produces a 16-byte auth tag. Recommended for most use cases.', keywords: ['gcm', 'galois', 'counter', 'authenticated encryption', 'aes-gcm', 'aes gcm'] },
  { q: 'What is AES-CBC?', a: 'AES-CBC (Cipher Block Chaining) encrypts each block XORed with the previous ciphertext. It requires PKCS#7 padding and does NOT provide authentication. Use GCM when possible.', keywords: ['cbc', 'cipher block chaining', 'block cipher', 'aes-cbc', 'aes cbc', 'padding'] },
  { q: 'What key format should I use?', a: 'GCM requires a Base64-encoded 256-bit key. CBC accepts a raw string of 16, 24, or 32 characters (128/192/256-bit). Use the Key Generator to create keys in both formats.', keywords: ['key format', 'key length', 'base64', 'hex', 'raw key', 'aes key', 'key size', 'bit'] },
  { q: 'How do artifacts work?', a: 'Artifacts package API documentation (curl, response, encryption) into structured text files. They generate two ZIPs: original + masked (sensitive data hidden). Saved to the library for later reference.', keywords: ['artifact', 'zip', 'documentation', 'soa', 'generate', 'download', 'curl', 'mask'] },
  { q: 'What is the library password?', a: 'The library password is set via the VITE_LIBRARY_PASSWORD environment variable. Ask your admin if you don\'t have it.', keywords: ['library', 'password', 'access', 'login', 'protected', 'unlock'] },
  { q: 'What is the Cipher Tool?', a: 'The Cipher Tool provides AES-256 encryption and decryption in GCM and CBC modes. It runs entirely in your browser using the Web Crypto API — no data ever leaves your machine.', keywords: ['cipher', 'encrypt', 'decrypt', 'encryption tool', 'aes tool', 'crypto tool'] },
  { q: 'What is the Artifact Generator?', a: 'The Artifact Generator creates structured SOA documentation packages from curl commands, API responses, and encryption details. It produces downloadable ZIP archives and saves them to the library.', keywords: ['artifact generator', 'artifact page', 'create artifact', 'new artifact', 'artifact form'] },
  { q: 'How do I compare artifacts?', a: 'In the Library page, check the box next to two artifacts and click the "Compare" button. You\'ll see a side-by-side field diff. Click "AI Summary" for a semantic change analysis.', keywords: ['compare', 'comparison', 'diff', 'difference', 'changes', 'side by side'] },
];

function findBestMatch(question) {
  const q = question.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const faq of FAQ) {
    let score = 0;
    if (q.includes(faq.q.toLowerCase())) {
      score = 10;
    }
    for (const kw of faq.keywords) {
      if (q.includes(kw)) score += 3;
    }
    if (score > bestScore) {
      bestScore = score;
      best = faq;
    }
  }
  return bestScore >= 3 ? best : null;
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
        setMessages(prev => prev.filter(m => !m.loading).concat({ role: 'bot', text: result }));
        return;
      }
    }

    const match = findBestMatch(question);
    const answer = match
      ? match.a
      : 'I\'m not sure about that. Try one of the FAQ topics above, or set VITE_GEMINI_API_KEY for AI-powered answers.';
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
