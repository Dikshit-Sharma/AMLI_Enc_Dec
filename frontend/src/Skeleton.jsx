import React from 'react';
import './Skeleton.css';

export function SkeletonRect({ width, height, style, className = '' }) {
  return (
    <div
      className={`skeleton skeleton-rect ${className}`}
      style={{ width, height, ...style }}
    />
  );
}

export function SkeletonText({ lines = 1, style }) {
  return (
    <div className="skeleton-text-group" style={style}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton skeleton-text"
          style={{ width: `${70 + Math.random() * 30}%` }}
        />
      ))}
    </div>
  );
}

export function SkeletonStatCard() {
  return (
    <div className="skeleton-stat-card">
      <div className="skeleton skeleton-circle" />
      <div className="skeleton skeleton-text" style={{ width: '40%', height: '1.6rem', marginTop: '0.5rem' }} />
      <div className="skeleton skeleton-text" style={{ width: '55%', height: '0.8rem', marginTop: '0.3rem' }} />
    </div>
  );
}

export function SkeletonRecentCard() {
  return (
    <div className="skeleton-recent-card">
      <div className="skeleton skeleton-text" style={{ width: '30%', height: '0.7rem' }} />
      <div className="skeleton skeleton-text" style={{ width: '70%', height: '1rem', marginTop: '0.5rem' }} />
      <div className="skeleton skeleton-text" style={{ width: '45%', height: '0.8rem', marginTop: '0.3rem' }} />
    </div>
  );
}

export function SkeletonTableRows({ rows = 5, cols = 7 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="skeleton-table-row">
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="skeleton skeleton-text"
              style={{ width: `${60 + Math.random() * 40}%`, height: '0.85rem' }}
            />
          ))}
        </div>
      ))}
    </>
  );
}

export function SkeletonChart() {
  return (
    <div className="skeleton-chart">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="skeleton skeleton-rect"
          style={{
            width: '100%',
            height: `${30 + Math.random() * 50}%`,
            maxHeight: '120px',
            borderRadius: '0.4rem',
          }}
        />
      ))}
    </div>
  );
}