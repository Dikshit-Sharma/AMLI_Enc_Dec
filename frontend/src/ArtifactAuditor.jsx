import React, { useState } from 'react';
import { parseCurl, createSafeArtifactForAI } from './artifactUtil';
import { SYSTEM_PROMPTS } from './ai/prompts';
import useAI from './ai/useAI';
import { extractJson } from './ai/extractJson';

function auditArtifact(art) {
  const issues = [];

  if (!art.jiraTicket || !/^SOA-\d+$/.test(art.jiraTicket)) {
    issues.push({ severity: 'error', field: 'jiraTicket', message: 'Jira ticket must match SOA-XXXX format' });
  }
  if (!art.apiName?.trim()) {
    issues.push({ severity: 'error', field: 'apiName', message: 'API name is required' });
  }
  if (!art.curl?.trim()) {
    issues.push({ severity: 'error', field: 'curl', message: 'Curl command is required' });
  } else {
    const parsed = parseCurl(art.curl);
    if (!parsed.url) {
      issues.push({ severity: 'error', field: 'curl', message: 'Could not extract URL from curl command' });
    } else {
      try {
        const hostname = new URL(parsed.url).hostname.toLowerCase();
        if (art.env === 'DEV' && !hostname.includes('dev') && !hostname.includes('localhost') && !/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
          issues.push({ severity: 'warning', field: 'env', message: `URL points to "${hostname}" but env is DEV — may need UAT/PROD` });
        }
        if (art.env === 'PROD' && (hostname.includes('test') || hostname.includes('uat'))) {
          issues.push({ severity: 'error', field: 'env', message: `URL points to "${hostname}" but env is PROD` });
        }
        if (!art.env) {
          issues.push({ severity: 'info', field: 'env', message: 'Environment not set' });
        }
      } catch { /* invalid URL */ }
    }
    if (!parsed.url.startsWith('http')) {
      issues.push({ severity: 'warning', field: 'curl', message: 'URL may be missing protocol (http/https)' });
    }
  }

  if (!art.response?.trim()) {
    issues.push({ severity: 'error', field: 'response', message: 'Response JSON is required' });
  } else {
    try { JSON.parse(art.response); } catch {
      issues.push({ severity: 'warning', field: 'response', message: 'Response is not valid JSON' });
    }
  }

  if (art.encryption === 'Enabled') {
    if (!art.aesKey?.trim()) {
      issues.push({ severity: 'error', field: 'aesKey', message: 'AES key is required when encryption is enabled' });
    } else if (art.algo === 'GCM') {
      try { atob(art.aesKey); } catch {
        issues.push({ severity: 'error', field: 'aesKey', message: 'GCM mode requires a valid Base64-encoded key' });
      }
    } else if (art.algo === 'CBC' && ![16, 24, 32].includes(art.aesKey.length)) {
      issues.push({ severity: 'error', field: 'aesKey', message: 'CBC mode key must be 16, 24, or 32 characters' });
    }
  }

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const score = Math.max(0, Math.min(100, 100 - errorCount * 25 - warningCount * 10));

  return { issues, score, errorCount, warningCount };
}

export default function ArtifactAuditor({ artifact, onClose, onJumpToField }) {
  const { callAI, aiLoading } = useAI();
  const [aiInsights, setAiInsights] = useState(null);

  const report = auditArtifact(artifact);
  const scoreColor = report.score >= 80 ? 'var(--success)' : report.score >= 50 ? '#f59e0b' : 'var(--error)';

  const handleAIEnhance = async () => {
    const safeArtifact = createSafeArtifactForAI(artifact);
    const result = await callAI(
      JSON.stringify(safeArtifact, null, 2),
      SYSTEM_PROMPTS.artifactAuditor,
      0.1
    );
    if (result) {
      const parsed = extractJson(result);
      if (parsed && parsed.aiIssues) {
        setAiInsights(parsed);
      } else {
        setAiInsights({ aiIssues: [{ severity: 'info', message: result }], summary: 'AI analysis completed. Review findings below.', score: report.score });
      }
    } else {
      setAiInsights({ aiIssues: [], summary: 'AI deep scan unavailable. Set VITE_GROQ_API_KEY to enable.', score: report.score });
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Artifact Audit Report</h2>
          <button className="close-modal" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body scrollable" style={{ padding: '1.5rem 2rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div style={{
              width: '80px', height: '80px', borderRadius: '50%',
              background: `conic-gradient(${scoreColor} ${report.score}%, rgba(255,255,255,0.1) 0%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 0.75rem', fontSize: '1.5rem', fontWeight: 800, color: scoreColor
            }}>
              {report.score}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {report.errorCount} errors · {report.warningCount} warnings
            </div>
          </div>

          {report.issues.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--success)', fontWeight: 600 }}>
              All checks passed! No issues found.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {report.issues.map((issue, i) => (
                <div key={i} style={{
                  display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
                  padding: '0.75rem 1rem', borderRadius: '0.75rem',
                  background: issue.severity === 'error' ? 'rgba(244,63,94,0.1)' :
                              issue.severity === 'warning' ? 'rgba(245,158,11,0.1)' : 'rgba(99,102,241,0.1)',
                  border: `1px solid ${issue.severity === 'error' ? 'rgba(244,63,94,0.2)' :
                                      issue.severity === 'warning' ? 'rgba(245,158,11,0.2)' : 'rgba(99,102,241,0.2)'}`
                }}>
                  <span style={{ fontSize: '1rem', flexShrink: 0 }}>
                    {issue.severity === 'error' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵'}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text)' }}>{issue.message}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      Field: {issue.field}
                    </div>
                  </div>
                  <button
                    style={{
                      background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '0.4rem',
                      padding: '0.25rem 0.5rem', fontSize: '0.7rem', cursor: 'pointer', color: 'var(--text)',
                      flexShrink: 0, width: 'auto'
                    }}
                    onClick={() => { onJumpToField?.(issue.field); onClose(); }}
                  >
                    Jump →
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="auditor-ai-section">
            {!aiInsights ? (
              <button
                className="btn-ai"
                disabled={aiLoading}
                onClick={handleAIEnhance}
              >
                {aiLoading ? <div className="loader tiny" /> : '🤖  AI-Powered Deep Scan'}
              </button>
            ) : (
              <div className="auditor-ai-card">
                <div className="auditor-ai-header">
                  <span className="auditor-ai-icon">🧠</span>
                  <span>AI Insights</span>
                  <button className="auditor-ai-regenerate" onClick={handleAIEnhance} disabled={aiLoading} title="Regenerate">
                    {aiLoading ? <div className="loader tiny" /> : '↻'}
                  </button>
                </div>
                {aiInsights.summary && (
                  <div className="auditor-ai-summary">{aiInsights.summary}</div>
                )}
                {aiInsights.aiIssues?.length > 0 && (
                  <div className="auditor-ai-issues">
                    {aiInsights.aiIssues.map((issue, i) => (
                      <div key={i} className={`auditor-ai-issue auditor-ai-issue--${issue.severity || 'info'}`}>
                        <span className="auditor-ai-issue-icon">
                          {issue.severity === 'error' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵'}
                        </span>
                        <span className="auditor-ai-issue-text">{issue.message}</span>
                      </div>
                    ))}
                  </div>
                )}
                {typeof aiInsights.score === 'number' && (
                  <div className="auditor-ai-score">
                    AI Score: <strong>{aiInsights.score}</strong>/100
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
