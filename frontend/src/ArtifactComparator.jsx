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

function curlDiff(a, b) {
  const d = [];
  if ((a.curl || '') !== (b.curl || '')) {
    d.push({ field: 'curl', from: a.curl?.substring(0, 100) + '...', to: b.curl?.substring(0, 100) + '...' });
  }
  if ((a.response || '') !== (b.response || '')) {
    d.push({ field: 'response', from: 'differs', to: 'differs' });
  }
  return d;
}

export default function ArtifactComparator({ artifactA, artifactB, onClose }) {
  const { callAI, aiLoading } = useAI();
  const [aiSummary, setAiSummary] = useState(null);

  const fieldDiffs = getFieldDiff(artifactA, artifactB);
  const curlDiffs = curlDiff(artifactA, artifactB);
  const allDiffs = [...fieldDiffs, ...curlDiffs];

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
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Artifact Comparator</h2>
          <button className="close-modal" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body scrollable" style={{ padding: '1.5rem 2rem' }}>
          {allDiffs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--success)', fontWeight: 600 }}>
              These artifacts are identical.
            </div>
          ) : (
            <>
              <div className="comparator-header">
                <div className="comparator-label">Artifact A: {artifactA.apiName || 'Unnamed'}</div>
                <div className="comparator-vs">vs</div>
                <div className="comparator-label">Artifact B: {artifactB.apiName || 'Unnamed'}</div>
              </div>

              <div className="comparator-diffs">
                {allDiffs.map((diff, i) => (
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

          <div className="comparator-ai-section">
            {!aiSummary ? (
              <button
                className="btn-ai"
                disabled={aiLoading || allDiffs.length === 0}
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
