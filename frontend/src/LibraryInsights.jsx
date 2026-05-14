import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { SYSTEM_PROMPTS } from './ai/prompts';
import useAI from './ai/useAI';
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

    const ts = art.timestamp?.toDate?.();
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
    const fetchData = async () => {
      try {
        const q = query(collection(db, 'artifacts'), orderBy('timestamp', 'desc'));
        const snapshot = await getDocs(q);
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setData(aggregate(docs));
      } catch (err) {
        console.error('Failed to load insights:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleAISummary = async () => {
    if (!data || data.total <= 5) return;
    const result = await callAI(
      JSON.stringify(data, null, 2),
      SYSTEM_PROMPTS.libraryInsights
    );
    if (result) {
      try {
        const cleaned = result.replace(/```(?:json)?\n?/g, '').trim();
        setAiSummary(JSON.parse(cleaned));
      } catch {
        setAiSummary({ aiSummary: result, recommendation: '' });
      }
    } else {
      const errorDetail = aiError ? ` Error: ${aiError}` : '';
      setAiSummary({
        aiSummary: `AI insights are currently unavailable.${errorDetail}`,
        recommendation: 'Check that VITE_GEMINI_API_KEY is set correctly and the Gemini API is enabled for your project.'
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

          <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            {!aiSummary ? (
              <button
                className="btn-primary"
                disabled={aiLoading || total <= 5}
                onClick={handleAISummary}
                style={{ width: '100%' }}
                title={total <= 5 ? 'Need at least 5 artifacts for AI analysis' : ''}
              >
                {aiLoading ? <div className="loader tiny" /> : '🤖 Generate AI Insights'}
              </button>
            ) : (
              <div style={{ background: 'rgba(99,102,241,0.05)', borderRadius: '0.75rem', padding: '1rem' }}>
                <div style={{ fontWeight: 700, marginBottom: '0.5rem', color: 'var(--primary)' }}>AI Analysis</div>
                <p style={{ fontSize: '0.85rem', lineHeight: 1.6, color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>
                  {aiSummary.aiSummary}
                </p>
                {aiSummary.recommendation && (
                  <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(16,185,129,0.1)', borderRadius: '0.5rem', fontSize: '0.85rem' }}>
                    <strong>Recommendation:</strong> {aiSummary.recommendation}
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
