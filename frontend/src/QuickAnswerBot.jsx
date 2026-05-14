import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { SYSTEM_PROMPTS } from './ai/prompts';
import useAI from './ai/useAI';
import { aiAvailable } from './ai/gemini';
import './QuickAnswerBot.css';

const FAQ = [
  { q: 'What is AES-GCM?', a: 'AES-GCM (Galois/Counter Mode) provides authenticated encryption — it encrypts data AND verifies integrity. It uses a 12-byte random IV and produces a 16-byte auth tag. Recommended for most use cases.' },
  { q: 'What is AES-CBC?', a: 'AES-CBC (Cipher Block Chaining) encrypts each block XORed with the previous ciphertext. It requires PKCS#7 padding and does NOT provide authentication. Use GCM when possible.' },
  { q: 'What key format should I use?', a: 'GCM requires a Base64-encoded 256-bit key. CBC accepts a raw string of 16, 24, or 32 characters (128/192/256-bit). Use the Key Generator to create keys in both formats.' },
  { q: 'How do artifacts work?', a: 'Artifacts package API documentation (curl, response, encryption) into structured text files. They generate two ZIPs: original + masked (sensitive data hidden). Saved to the library for later reference.' },
  { q: 'What is the library password?', a: 'The library password is set via the VITE_LIBRARY_PASSWORD environment variable. Ask your admin if you don\'t have it.' }
];

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
      setMessages(prev => prev.filter(m => !m.loading).concat(result ? { role: 'bot', text: result } : { role: 'bot', text: 'Sorry, I couldn\'t process that. Please try again.' }));
    } else {
      const match = FAQ.find(f => question.toLowerCase().includes(f.q.toLowerCase().slice(0, 10)));
      const answer = match ? match.a : 'AI is not configured. Set VITE_GEMINI_API_KEY for AI-powered answers, or browse the FAQ above.';
      setMessages(prev => prev.filter(m => !m.loading).concat({ role: 'bot', text: answer }));
    }
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
