import React from 'react';
import * as Sentry from '@sentry/react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, eventId: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    const eventId = Sentry.captureException(error, { contexts: { react: { componentStack: errorInfo.componentStack } } });
    this.setState({ eventId });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, eventId: null });
  };

  handleReload = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif', background: 'var(--bg, #f9fafb)', color: 'var(--text, #1f2937)', padding: '2rem' }}>
          <div style={{ maxWidth: '480px', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem' }}>Something went wrong</h1>
            <p style={{ fontSize: '0.88rem', color: '#6b7280', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              An unexpected error occurred. The issue has been reported to our monitoring system.
            </p>
            {this.state.eventId && (
              <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '1.5rem', fontFamily: 'monospace' }}>
                Error ID: {this.state.eventId}
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button onClick={this.handleReset} style={{ padding: '0.6rem 1.2rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                Try Again
              </button>
              <button onClick={this.handleReload} style={{ padding: '0.6rem 1.2rem', background: 'transparent', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}>
                Go to Homepage
              </button>
            </div>
            {this.state.error && (
              <details style={{ marginTop: '1.5rem', textAlign: 'left' }}>
                <summary style={{ fontSize: '0.78rem', color: '#9ca3af', cursor: 'pointer', userSelect: 'none' }}>Technical Details</summary>
                <pre style={{ marginTop: '0.5rem', padding: '0.75rem', background: '#f3f4f6', borderRadius: '6px', fontSize: '0.72rem', color: '#374151', overflow: 'auto', maxHeight: '200px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {this.state.error.message}
                  {'\n\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
