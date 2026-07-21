import React from 'react';

const shortcuts = [
  { keys: ['Ctrl', 'Shift', 'E'], label: 'Go to Cipher Tool' },
  { keys: ['Ctrl', 'Shift', 'A'], label: 'Go to Artifacts' },
  { keys: ['Ctrl', 'Shift', 'L'], label: 'Go to Library' },
  { keys: ['Ctrl', 'Shift', 'J'], label: 'Go to Jenkins Pipelines' },
  { keys: ['?'], label: 'Toggle this help modal' },
  { keys: ['Esc'], label: 'Close modals' },
];

export default function HotkeyHelp({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '480px', padding: '2rem' }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
          }}
        >
          <h2 style={{ margin: 0 }}>⌨ Keyboard Shortcuts</h2>
          <button className="close-modal" onClick={onClose}>
            &times;
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {shortcuts.map((s) => (
            <div
              key={s.label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.6rem 0',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                {s.label}
              </span>
              <span style={{ display: 'flex', gap: '0.35rem' }}>
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    style={{
                      background: 'var(--input-bg)',
                      border: '1px solid var(--border)',
                      borderRadius: '0.4rem',
                      padding: '0.2rem 0.5rem',
                      fontSize: '0.75rem',
                      fontFamily: 'inherit',
                      color: 'var(--text)',
                    }}
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
