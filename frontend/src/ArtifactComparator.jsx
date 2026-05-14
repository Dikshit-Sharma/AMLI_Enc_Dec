import React, { useState } from 'react';
import { SYSTEM_PROMPTS } from './ai/prompts';
import useAI from './ai/useAI';
import { extractJson } from './ai/extractJson';
import './ArtifactComparator.css';

function getFieldDiff(a, b) {
  const fields = ['jiraTicket', 'apiName', 'env', 'encryption', 'algo', 'aesKey'];
  const diffs = [];
  for (const field of fields) {
    if ((a[field] || '') !== (b[field] || '')) {
      diffs.push({ field, from: a[field] || '(empty)', to: b[field] || '(empty)' });
    }
  }
  return diffs;
}

function lineDiff(aText, bText) {
  const aLines = (aText || '').split('\n');
  const bLines = (bText || '').split('\n');
  const maxLen = Math.max(aLines.length, bLines.length);
  const lines = [];
  for (let i = 0; i < maxLen; i++) {
    const aLine = aLines[i] ?? null;
    const bLine = bLines[i] ?? null;
    if (aLine === bLine) {
      lines.push({ type: 'same', a: aLine, b: bLine });
    } else {
      lines.push({ type: 'diff', a: aLine, b: bLine });
    }
  }
  return lines;
}

function CollapsibleDiff({ label, aText, bText, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const diffs = lineDiff(aText, bText);
  const changeCount = diffs.filter((l) => l.type === 'diff').length;
  const hasContent = aText || bText;

  if (!hasContent) return null;

  return (
    <div className="comparator-section">
      <button className="comparator-section-header" onClick={() => setOpen(!open)}>
        <span>{open ? '▼' : '▶'} {label}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {diffs.length} lines{changeCount > 0 ? `, ${changeCount} changed` : ''}
        </span>
      </button>
      {open && (
        <div className="comparator-section-body">
          <div className="comparator-diff-lines">
            {diffs.map((line, i) => (
              <div key={i} className={`comparator-diff-line ${line.type === 'diff' ? 'changed' : ''}`}>
                <div className="comparator-diff-line-num">{i + 1}</div>
                <div className={`comparator-diff-line-value ${line.type === 'diff' ? 'from' : ''}`}>
                  {line.a !== null ? line.a : ''}
                </div>
                <div className={`comparator-diff-line-value ${line.type === 'diff' ? 'to' : ''}`}>
                  {line.b !== null ? line.b : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ArtifactComparator({ artifactA, artifactB, onClose }) {
  const { callAI, aiLoading } = useAI();
  const [aiSummary, setAiSummary] = useState(null);

  const fieldDiffs = getFieldDiff(artifactA, artifactB);

  const handleAICompare = async () => {
    const result = await callAI(
      JSON.stringify({ artifactA, artifactB }, null, 2),
      SYSTEM_PROMPTS.artifactComparator,
      0.1
    );
    if (result) {
      const parsed = extractJson(result);
      if (parsed && parsed.aiDifferences) {
        setAiSummary(parsed);
      } else {
        setAiSummary({ summary: result, aiDifferences: [] });
      }
    } else {
      setAiSummary({ summary: 'AI summary unavailable. Set VITE_GROQ_API_KEY to enable.', aiDifferences: [] });
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '960px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Artifact Comparator</h2>
          <button className="close-modal" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body scrollable" style={{ padding: '1.5rem 2rem' }}>
          <div className="comparator-header">
            <div className="comparator-label">Artifact A: {artifactA.apiName || 'Unnamed'}</div>
            <div className="comparator-vs">vs</div>
            <div className="comparator-label">Artifact B: {artifactB.apiName || 'Unnamed'}</div>
          </div>

          {fieldDiffs.length > 0 && (
            <>
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Field Differences
              </h3>
              <div className="comparator-diffs" style={{ marginBottom: '1.5rem' }}>
                {fieldDiffs.map((diff, i) => (
                  <div key={i} className="comparator-diff-row">
                    <div className="comparator-diff-field">{diff.field}</div>
                    <div className="comparator-diff-value from">{diff.from}</div>
                    <div className="comparator-diff-arrow">→</div>
                    <div className="comparator-diff-value to">{diff.to}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {fieldDiffs.length === 0 && (
            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--success)', fontWeight: 600, marginBottom: '1rem' }}>
              All fields match.
            </div>
          )}

          <CollapsibleDiff label="Curl Command" aText={artifactA.curl} bText={artifactB.curl} defaultOpen />
          <CollapsibleDiff label="Response" aText={artifactA.response} bText={artifactB.response} defaultOpen={false} />

          <div className="comparator-ai-section">
            {!aiSummary ? (
              <button
                className="btn-ai"
                disabled={aiLoading}
                onClick={handleAICompare}
              >
                {aiLoading ? <div className="loader tiny" /> : '🤖  AI Summary of Changes'}
              </button>
            ) : (
              <div className="comparator-ai-card">
                <div className="comparator-ai-header">
                  <span className="comparator-ai-icon">🧠</span>
                  <span>AI Analysis</span>
                  <button className="comparator-ai-regenerate" onClick={handleAICompare} disabled={aiLoading} title="Regenerate">
                    {aiLoading ? <div className="loader tiny" /> : '↻'}
                  </button>
                </div>
                <div className="comparator-ai-summary">{aiSummary.summary}</div>
                {aiSummary.aiDifferences?.length > 0 && (
                  <div className="comparator-ai-diffs">
                    <div className="comparator-ai-diffs-title">Key Differences</div>
                    <div className="comparator-ai-diffs-list">
                      {aiSummary.aiDifferences.map((d, i) => (
                        <div key={i} className="comparator-ai-diff-row">
                          <span className="comparator-ai-diff-field">{d.field}</span>
                          <span className="comparator-ai-diff-desc">{d.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}