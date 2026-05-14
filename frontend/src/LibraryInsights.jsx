import React, { useState, useEffect } from 'react';
import { SYSTEM_PROMPTS } from './ai/prompts';
import useAI from './ai/useAI';
import { extractJson } from './ai/extractJson';
import { fetchArtifacts, toDate } from './api';
import './LibraryInsights.css';

function aggregate(artifacts) {
  if (!artifacts?.length) return null;

  const envCount = {};
  const apiCount = {};
  const monthlyCount = {};
  let encryptedCount = 0;

  for (const art of artifacts) {
    const env = art.env || 'DEV';
    envCount[env] = (envCount[env] || 0) + 1;

    const name = art.apiName || 'Unnamed';
    apiCount[name] = (apiCount[name] || 0) + 1;

    if (art.encryption === 'Enabled') encryptedCount++;

    const ts = toDate(art.timestamp);
    if (ts) {
      const key = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}`;
      monthlyCount[key] = (monthlyCount[key] || 0) + 1;
    }
  }

  const topApis = Object.entries(apiCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const total = artifacts.length;
  const encryptionRate = Math.round((encryptedCount / total) * 100);

  return { envCount, topApis, total, encryptedCount, encryptionRate, monthlyCount };
}

export default function LibraryInsights({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { callAI, aiLoading, aiError } = useAI();
  const [aiSummary, setAiSummary] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const docs = await fetchArtifacts();
        setData(aggregate(docs));
      } catch (err) {
        console.error('Failed to load insights:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleAISummary = async () => {
    if (!data || data.total <= 5) return;
    const result = await callAI(
      JSON.stringify(data, null, 2),
      SYSTEM_PROMPTS.libraryInsights,
      0.1
    );
    if (result) {
      const parsed = extractJson(result);
      if (parsed && parsed.aiSummary) {
        if (Array.isArray(parsed.aiSummary)) {
          parsed.aiSummary = parsed.aiSummary.join(' ');
        }
        if (Array.isArray(parsed.recommendation)) {
          parsed.recommendation = parsed.recommendation.join(' ');
        }
        setAiSummary(parsed);
      } else {
        setAiSummary({ aiSummary: result, recommendation: '' });
      }
    } else {
      const errorDetail = aiError ? ` Error: ${aiError}` : '';
      setAiSummary({
        aiSummary: `AI insights are currently unavailable.${errorDetail}`,
        recommendation: 'Check that VITE_GROQ_API_KEY is set correctly.'
      });
    }
  };

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content insights-modal" onClick={e => e.stopPropagation()}>
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <div className="loader" style={{ margin: '0 auto' }} />
            <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Loading library data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data || data.total === 0) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content insights-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>Library Insights</h2>
            <button className="close-modal" onClick={onClose}>&times;</button>
          </div>
          <div className="modal-body scrollable" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            No artifacts found. Generate some artifacts first to see insights!
          </div>
        </div>
      </div>
    );
  }

  const { envCount, topApis, total, encryptedCount, encryptionRate, monthlyCount } = data;
  const months = Object.entries(monthlyCount).sort();
  const maxMonthly = Math.max(...months.map(m => m[1]), 1);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content insights-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Library Insights</h2>
          <button className="close-modal" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body scrollable" style={{ padding: '1.5rem 2rem' }}>

          <div className="insights-grid">
            <div className="insights-card">
              <div className="insights-card-value">{total}</div>
              <div className="insights-card-label">Total Artifacts</div>
            </div>
            <div className="insights-card">
              <div className="insights-card-value">{topApis.length}</div>
              <div className="insights-card-label">Unique APIs</div>
            </div>
            <div className="insights-card">
              <div className="insights-card-value">{encryptionRate}%</div>
              <div className="insights-card-label">Encryption Rate</div>
            </div>
            <div className="insights-card">
              <div className="insights-card-value">{encryptedCount}/{total}</div>
              <div className="insights-card-label">Encrypted</div>
            </div>
          </div>

          <div className="insights-section">
            <h3 className="insights-section-title">Environment Distribution</h3>
            <div className="insights-bar-group">
              {Object.entries(envCount).map(([env, count]) => {
                const pct = Math.round((count / total) * 100);
                const color = env === 'PROD' ? 'var(--error)' : env === 'UAT' ? '#f59e0b' : 'var(--success)';
                return (
                  <div key={env} className="insights-bar-row">
                    <span className="insights-bar-label">{env}</span>
                    <div className="insights-bar-track">
                      <div className="insights-bar-fill" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <span className="insights-bar-count">{count} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="insights-section">
            <h3 className="insights-section-title">Top APIs</h3>
            <div className="insights-bar-group">
              {topApis.map(([name, count], i) => {
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={name} className="insights-bar-row">
                    <span className="insights-bar-label">{i + 1}. {name}</span>
                    <div className="insights-bar-track">
                      <div className="insights-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="insights-bar-count">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {months.length > 0 && (
            <div className="insights-section">
              <h3 className="insights-section-title">Monthly Activity</h3>
              <div className="insights-monthly">
                {months.map(([month, count]) => (
                  <div key={month} className="insights-monthly-bar" style={{ height: `${(count / maxMonthly) * 120}px` }}>
                    <span className="insights-monthly-count">{count}</span>
                    <div className="insights-monthly-fill" />
                    <span className="insights-monthly-label">{month}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="insights-ai-section">
            {!aiSummary ? (
              <button
                className="btn-ai"
                disabled={aiLoading || total <= 5}
                onClick={handleAISummary}
                title={total <= 5 ? 'Need at least 5 artifacts for AI analysis' : ''}
              >
                {aiLoading ? <div className="loader tiny" /> : '🤖  Generate AI Insights'}
              </button>
            ) : (
              <div className="insights-ai-card">
                <div className="insights-ai-header">
                  <span className="insights-ai-icon">🧠</span>
                  <span>AI Analysis</span>
                  <button className="insights-ai-regenerate" onClick={handleAISummary} disabled={aiLoading} title="Regenerate">
                    {aiLoading ? <div className="loader tiny" /> : '↻'}
                  </button>
                </div>
                <div className="insights-ai-summary">{aiSummary.aiSummary.replace(/^[\s]*[-*•]\s+/gm, '').replace(/^[\s]*\d+[.)]\s+/gm, '').replace(/\n{2,}/g, '\n').replace(/\n/g, ' ')}</div>
                {aiSummary.recommendation && (
                  <div className="insights-ai-recs">
                    <div className="insights-ai-recs-title">Recommendation</div>
                    <div className="insights-ai-recs-list">
                      <div className="insights-ai-rec-row">{aiSummary.recommendation}</div>
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
