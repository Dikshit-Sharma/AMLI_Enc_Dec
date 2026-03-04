import React from 'react';
import { Link } from 'react-router-dom';

export default function HomePage({ theme, toggleTheme }) {
  return (
    <>
      <div className="theme-toggle-wrapper" style={{ position: 'fixed', top: '2rem', right: '2rem', zIndex: 100 }}>
        <button className="theme-toggle" onClick={toggleTheme}>
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </div>
      <div className="home-container">
      <section className="hero-section">
        <h1>AMLI TOOLS</h1>
        <p>A suite of professional encryption, decryption, and artifact management tools designed for speed, security, and developer productivity.</p>
      </section>

      <div className="tools-grid">
        <Link to="/cipher" className="tool-card">
          <div className="card-icon">🔐</div>
          <h3>Cipher Tool</h3>
          <p>Secure AES encryption and decryption with support for GCM and CBC modes. Advanced auto-formatting and validation built-in.</p>
        </Link>

        <Link to="/artifacts" className="tool-card">
          <div className="card-icon">💎</div>
          <h3>Artifacts</h3>
          <p>Generate highly-structured documentation packages and ZIP archives for SOA requests with automated encryption support.</p>
        </Link>

        <Link to="/library" className="tool-card">
          <div className="card-icon">📚</div>
          <h3>API Library</h3>
          <p>Access your history of generated artifacts. Search, review, and re-download past configurations with ease.</p>
        </Link>
      </div>

      <footer className="footer-minimal">
        Built by <strong>Dikshit Sharma</strong> | dikshit.sharma2580@gmail.com
      </footer>
      </div>
    </>
  );
}
