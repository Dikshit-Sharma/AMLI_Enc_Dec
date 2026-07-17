import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchArtifactStats, fetchCredentials, fetchExtractedCredentials, toDate } from './api';
import { SkeletonStatCard, SkeletonRecentCard, SkeletonChart } from './Skeleton';

const ENVS = ['DEV', 'UAT', 'PROD'];
const ENV_COLORS = { DEV: '#10b981', UAT: '#f59e0b', PROD: '#ef4444' };
const ENV_ICONS = { DEV: '🛠', UAT: '🧪', PROD: '🚀' };

function FilterChip({ label, onClear }) {
  return (
    <div className="filter-chip">
      <span className="filter-chip-label">Filter: <strong>{label}</strong></span>
      <button className="filter-chip-clear" onClick={onClear} title="Clear filter">✕</button>
    </div>
  );
}

const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ActivityCalendar({ activity, filterDate, onDateFilter }) {
  const weeks = 52;
  const cellSize = 13;
  const cellGap = 3;
  const dayLabelW = 30;
  const monthLabelH = 16;

  const { cells, monthMarkers, today } = useMemo(() => {
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + (6 - end.getDay()));
    const start = new Date(end);
    start.setDate(start.getDate() - (weeks * 7 - 1));
    start.setHours(0, 0, 0, 0);

    const countMap = {};
    for (const entry of activity || []) {
      countMap[entry.date] = entry.count;
    }

    const cells = [];
    const monthMarkers = [];
    let lastMonth = -1;
    const cursor = new Date(start);

    while (cursor <= end) {
      const dateStr = cursor.toISOString().slice(0, 10);
      const count = countMap[dateStr] || 0;
      const dayOfWeek = cursor.getDay();
      const weekIdx = Math.floor((cursor - start) / (7 * 86400000));
      const month = cursor.getMonth();
      const isToday = dateStr === now.toISOString().slice(0, 10);

      if (month !== lastMonth) {
        const firstOfMonth = new Date(cursor.getFullYear(), month, 1);
        if (firstOfMonth >= start) {
          const fWeekIdx = Math.floor((firstOfMonth - start) / (7 * 86400000));
          if (!monthMarkers.some(m => m.week === fWeekIdx)) {
            monthMarkers.push({ label: MONTH_LABELS[month], week: fWeekIdx });
          }
        }
        lastMonth = month;
      }

      cells.push({ dateStr, count, dayOfWeek, weekIdx, isToday });
      cursor.setDate(cursor.getDate() + 1);
    }

    const todayStr = now.toISOString().slice(0, 10);

    return { cells, monthMarkers, today: todayStr };
  }, [activity]);

  const maxCount = useMemo(() => Math.max(...cells.map(c => c.count), 1), [cells]);
  const levels = useMemo(() => {
    const nonZero = cells.filter(c => c.count > 0).map(c => c.count).sort((a, b) => a - b);
    if (nonZero.length === 0) return [0, 0, 0, 0];
    const len = nonZero.length;
    return [
      nonZero[Math.floor(len * 0.25)] || 1,
      nonZero[Math.floor(len * 0.5)] || 1,
      nonZero[Math.floor(len * 0.75)] || 1,
      nonZero[len - 1] || 1,
    ];
  }, [cells]);

  const getColor = (count) => {
    if (count === 0) return 'transparent';
    if (count <= levels[0]) return 'var(--cal-level-1)';
    if (count <= levels[1]) return 'var(--cal-level-2)';
    if (count <= levels[2]) return 'var(--cal-level-3)';
    return 'var(--cal-level-4)';
  };

  const totalW = dayLabelW + weeks * (cellSize + cellGap);
  const totalH = monthLabelH + 7 * (cellSize + cellGap);

  const [tooltip, setTooltip] = useState(null);

  return (
    <div className="chart-container">
      <h3 className="chart-title">Activity Calendar{filterDate ? ` — ${filterDate}` : ''}</h3>
      <div className="cal-heatmap-wrap">
        <div className="cal-heatmap-scroll">
          <svg width={totalW} height={totalH} className="cal-heatmap-svg">
            {monthMarkers.map((m, i) => (
              <text key={i} x={dayLabelW + m.week * (cellSize + cellGap)} y={monthLabelH - 4}
                fill="var(--text-muted)" fontSize="9" fontWeight="600">{m.label}</text>
            ))}
            {DAY_LABELS.map((label, i) => label ? (
              <text key={i} x={0} y={monthLabelH + i * (cellSize + cellGap) + cellSize - 2}
                fill="var(--text-muted)" fontSize="8" textAnchor="start">{label}</text>
            ) : null)}
            {cells.map((c, i) => {
              const x = dayLabelW + c.weekIdx * (cellSize + cellGap);
              const y = monthLabelH + c.dayOfWeek * (cellSize + cellGap);
              const isActive = filterDate === c.dateStr;
              return (
                <rect key={i} x={x} y={y} width={cellSize} height={cellSize} rx="3"
                  fill={c.count > 0 ? getColor(c.count) : 'var(--cal-empty)'}
                  stroke={c.isToday ? 'var(--primary)' : (isActive ? 'var(--text)' : 'none')}
                  strokeWidth={c.isToday ? 2 : (isActive ? 1.5 : 0)}
                  style={{ cursor: 'pointer', transition: 'fill 0.15s' }}
                  onMouseEnter={(e) => {
                    const rect = e.target.getBoundingClientRect();
                    setTooltip({ x: rect.left + rect.width / 2, y: rect.top - 8, dateStr: c.dateStr, count: c.count });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                  onClick={() => onDateFilter(isActive ? null : c.dateStr)}
                />
              );
            })}
          </svg>
          {tooltip && (
            <div className="cal-tooltip" style={{ position: 'fixed', left: tooltip.x, top: tooltip.y, transform: 'translate(-50%, -100%)' }}>
              <strong>{tooltip.dateStr}</strong>: {tooltip.count} {tooltip.count === 1 ? 'artifact' : 'artifacts'}
            </div>
          )}
        </div>
        <div className="cal-legend">
          <span className="cal-legend-label">Less</span>
          <span className="cal-legend-swatch" style={{ background: 'var(--cal-empty)' }} />
          <span className="cal-legend-swatch" style={{ background: 'var(--cal-level-1)' }} />
          <span className="cal-legend-swatch" style={{ background: 'var(--cal-level-2)' }} />
          <span className="cal-legend-swatch" style={{ background: 'var(--cal-level-3)' }} />
          <span className="cal-legend-swatch" style={{ background: 'var(--cal-level-4)' }} />
          <span className="cal-legend-label">More</span>
        </div>
      </div>
    </div>
  );
}

function ChartToolbar({ title, chartType, onChartTypeChange, onFullscreen, stats }) {
  const types = [
    { key: 'bar', icon: '▨' },
    { key: 'line', icon: '╱' },
    { key: 'area', icon: '◢' },
  ];
  return (
    <div className="chart-title-row">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <h3 className="chart-title">{title}</h3>
        {stats}
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <div className="chart-toggle">
          {types.map(t => (
            <button key={t.key} className={`chart-toggle-btn ${chartType === t.key ? 'active' : ''}`}
              onClick={() => onChartTypeChange(t.key)} title={t.key}>{t.icon}</button>
          ))}
        </div>
        <button className="chart-fullscreen-btn" onClick={onFullscreen} title="Full screen">⛶</button>
      </div>
    </div>
  );
}

function DonutChart({ data, activeFilter, onFilterChange, chartType }) {
  if (!data || data.length === 0) return null;
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  if (chartType === 'bar') {
    const max = Math.max(...data.map(d => d.value), 1);
    return (
      <div style={{ padding: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {data.map((d) => {
          const isActive = activeFilter === d.label;
          return (
            <div key={d.label} className="topapi-row" style={{ cursor: 'pointer', opacity: activeFilter && !isActive ? 0.4 : 1 }}
              onClick={() => onFilterChange(isActive ? null : d.label)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="donut-dot" style={{ background: ENV_COLORS[d.label] }} />
                <span className="topapi-name">{d.label}</span>
              </div>
              <div className="topapi-bar-track">
                <div className="topapi-bar-fill" style={{ width: `${(d.value / max) * 100}%`, background: ENV_COLORS[d.label], opacity: 0.7 }} />
              </div>
              <span className="topapi-count">{d.value}</span>
            </div>
          );
        })}
      </div>
    );
  }

  const r = 72;
  const cx = 100;
  const cy = 100;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut-container">
      <div className="donut-chart-area">
        <div className="donut-center">
          <span className="donut-total">{activeFilter ? data.find(d => d.label === activeFilter)?.value || total : total}</span>
          <span className="donut-total-label">{activeFilter ? activeFilter : 'total'}</span>
        </div>
        <svg width="180" height="180" viewBox="0 0 200 200" style={{ cursor: 'pointer' }}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth="20" />
          {data.map((d) => {
            const seg = (d.value / total) * circ;
            const dash = `${seg} ${circ - seg}`;
            const isActive = activeFilter === d.label;
            const sw = isActive ? 24 : 20;
            const el = (
              <circle
                key={d.label}
                cx={cx} cy={cy} r={r} fill="none"
                stroke={ENV_COLORS[d.label]}
                strokeWidth={sw}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.6s ease, stroke-width 0.2s ease', cursor: 'pointer', opacity: activeFilter && !isActive ? 0.35 : 1 }}
                onClick={() => onFilterChange(isActive ? null : d.label)}
              />
            );
            offset += seg;
            return el;
          })}
        </svg>
      </div>
      <div className="donut-legend">
        {data.map((d) => {
          const isActive = activeFilter === d.label;
          return (
            <div key={d.label} className={`donut-legend-item ${isActive ? 'active' : ''}`}
              style={{ cursor: 'pointer', opacity: activeFilter && !isActive ? 0.4 : 1 }}
              onClick={() => onFilterChange(isActive ? null : d.label)}>
              <span className="donut-dot" style={{ background: ENV_COLORS[d.label] }} />
              <span className="donut-label">{d.label}</span>
              <span className="donut-value">{d.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VelocityChart({ dailyVelocity, filterEnv, chartType, onChartTypeChange, brushRange, onBrush, onFullscreen }) {
  const [hovered, setHovered] = useState(null);
  const [isBrushing, setIsBrushing] = useState(false);
  const [brushStart, setBrushStart] = useState(null);
  const [brushEnd, setBrushEnd] = useState(null);
  const svgRef = useRef(null);

  const { data, maxCount, total, avg } = useMemo(() => {
    const days = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push({
        date: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        count: 0, ma7: null,
      });
    }
    for (const entry of dailyVelocity || []) {
      if (filterEnv && entry.env !== filterEnv) continue;
      const day = days.find(d => d.date === entry.date);
      if (day) day.count += entry.count;
    }
    for (let i = 0; i < days.length; i++) {
      if (i >= 6) {
        let sum = 0;
        for (let j = i - 6; j <= i; j++) sum += days[j].count;
        days[i].ma7 = Math.round((sum / 7) * 10) / 10;
      }
    }
    return {
      data: days,
      maxCount: Math.max(...days.map(d => d.count), 1),
      total: days.reduce((s, d) => s + d.count, 0),
      avg: Math.round((days.reduce((s, d) => s + d.count, 0) / 30) * 10) / 10,
    };
  }, [dailyVelocity, filterEnv]);

  const M = { top: 22, right: 16, bottom: 28, left: 36 };
  const W = 800, H = 220;
  const cw = W - M.left - M.right;
  const ch = H - M.top - M.bottom;

  const xS = (i) => M.left + (data.length > 1 ? (i / (data.length - 1)) * cw : cw / 2);
  const yS = (v) => M.top + ch - (v / maxCount) * ch;
  const baseY = M.top + ch;
  const colW = cw / data.length;

  const pts = data.map((d, i) => ({ x: xS(i), y: yS(d.count) }));
  const areaPath = pts.length > 1 ? `M${pts[0].x},${baseY} L${pts.map(p => `${p.x},${p.y}`).join(' L')} L${pts[pts.length - 1].x},${baseY} Z` : '';
  const linePath = pts.length > 1 ? `M${pts.map(p => `${p.x},${p.y}`).join(' L')}` : '';

  const maPts = data.filter(d => d.ma7 !== null).map(d => {
    const idx = data.indexOf(d);
    return { x: xS(idx), y: yS(d.ma7) };
  });
  const maPath = maPts.length > 1 ? `M${maPts.map(p => `${p.x},${p.y}`).join(' L')}` : '';
  const maDotIdx = hovered !== null && hovered >= 6 ? hovered : null;

  const grids = Array.from({ length: 5 }, (_, i) => {
    const r = i / 4;
    return { y: M.top + ch - r * ch, label: Math.round(maxCount * r) };
  });

  const xLabels = data.filter((_, i) => i % 5 === 0 || i === data.length - 1);

  const getIdxFromX = useCallback((clientX) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * W;
    let minDist = Infinity;
    let idx = null;
    for (let i = 0; i < data.length; i++) {
      const d = Math.abs(xS(i) - svgX);
      if (d < minDist) { minDist = d; idx = i; }
    }
    return idx;
  }, [data, xS, W]);

  const handleMouseDown = (e) => {
    const idx = getIdxFromX(e.clientX);
    if (idx === null) return;
    setIsBrushing(true);
    setBrushStart(idx);
    setBrushEnd(idx);
  };

  const handleMouseMove = (e) => {
    if (!isBrushing) return;
    const idx = getIdxFromX(e.clientX);
    if (idx !== null) setBrushEnd(idx);
  };

  const handleMouseUp = () => {
    if (!isBrushing) return;
    setIsBrushing(false);
    if (brushStart !== null && brushEnd !== null) {
      const low = Math.min(brushStart, brushEnd);
      const high = Math.max(brushStart, brushEnd);
      if (high - low >= 1) {
        onBrush({ startIdx: low, endIdx: high, startDate: data[low].date, endDate: data[high].date });
      } else {
        onBrush(null);
      }
    }
    setBrushStart(null);
    setBrushEnd(null);
  };

  const brushLow = brushRange ? brushRange.startIdx : (brushStart !== null && brushEnd !== null ? Math.min(brushStart, brushEnd) : null);
  const brushHigh = brushRange ? brushRange.endIdx : (brushStart !== null && brushEnd !== null ? Math.max(brushStart, brushEnd) : null);

  return (
    <div className="chart-container">
      <ChartToolbar title="Artifact Generation Velocity" chartType={chartType} onChartTypeChange={onChartTypeChange}
        onFullscreen={onFullscreen}
        stats={
          <div className="velocity-stats">
            <span className="velocity-stat">{total} this month</span>
            <span className="velocity-stat">{avg}/day avg</span>
            {brushRange && (
              <button className="velocity-stat velocity-stat--clear" onClick={() => onBrush(null)} style={{ cursor: 'pointer', borderColor: 'var(--primary)', color: 'var(--primary)' }}>
                ✕ Clear brush
              </button>
            )}
          </div>
        }
      />
      <div className="velocity-chart-wrap">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="velocity-svg"
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
          style={{ cursor: isBrushing ? 'ew-resize' : 'default' }}
        >
          <defs>
            <linearGradient id="veloGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.01" />
            </linearGradient>
            <linearGradient id="veloGradBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.7" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.3" />
            </linearGradient>
          </defs>

          {grids.map((g, i) => (
            <g key={i}>
              <line x1={M.left} y1={g.y} x2={W - M.right} y2={g.y} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />
              <text x={M.left - 5} y={g.y + 3} textAnchor="end" fill="var(--text-muted)" fontSize="9">{g.label}</text>
            </g>
          ))}

          {/* Brush highlight */}
          {brushLow !== null && brushHigh !== null && (
            <rect x={xS(brushLow) - colW / 2} y={M.top} width={xS(brushHigh) - xS(brushLow) + colW} height={ch}
              fill="var(--primary)" opacity="0.08" rx="4" />
          )}

          {/* Chart type render */}
          {chartType === 'bar' ? (
            data.map((d, i) => {
              const barW = colW * 0.6;
              const cx = xS(i);
              return (
                <rect key={i} x={cx - barW / 2} y={yS(d.count)} width={barW} height={d.count > 0 ? ch - (yS(d.count) - M.top) : 0}
                  fill="url(#veloGradBar)" rx="2"
                  style={{ transition: 'y 0.3s ease, height 0.3s ease' }} />
              );
            })
          ) : chartType === 'area' ? (
            <>
              {areaPath && data.length > 1 && <path d={areaPath} fill="url(#veloGrad)" />}
              {linePath && data.length > 1 && <path d={linePath} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
            </>
          ) : (
            <>
              {linePath && data.length > 1 && <path d={linePath} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
            </>
          )}

          {maPath && chartType !== 'bar' && (
            <path d={maPath} fill="none" stroke="var(--secondary)" strokeWidth="2" strokeDasharray="5 3" strokeLinecap="round" strokeLinejoin="round" />
          )}

          {xLabels.map((d, i) => {
            const idx = data.indexOf(d);
            return (
              <text key={i} x={xS(idx)} y={H - 4} textAnchor="middle" fill="var(--text-muted)" fontSize="9">{d.label}</text>
            );
          })}

          {/* Hover rects */}
          {data.map((d, i) => (
            <rect key={i} x={xS(i) - colW / 2} y={M.top} width={colW} height={ch} fill="transparent"
              onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} />
          ))}

          {/* Hover indicators */}
          {hovered !== null && chartType !== 'bar' && (
            <g>
              <line x1={xS(hovered)} y1={M.top} x2={xS(hovered)} y2={baseY} stroke="var(--primary)" strokeWidth="1" strokeDasharray="3 3" opacity="0.35" />
              <circle cx={xS(hovered)} cy={yS(data[hovered].count)} r="4" fill="var(--primary)" stroke="var(--card-bg)" strokeWidth="2" style={{ transition: 'cx 0.15s, cy 0.15s' }} />
              {maDotIdx !== null && (
                <circle cx={xS(maDotIdx)} cy={yS(data[maDotIdx].ma7)} r="4" fill="var(--secondary)" stroke="var(--card-bg)" strokeWidth="2" style={{ transition: 'cx 0.15s, cy 0.15s' }} />
              )}
              <rect x={xS(hovered) - 54} y={M.top + 4} width="108" height="40" rx="6" fill="var(--card-bg)" stroke="var(--border)" strokeWidth="1" />
              <text x={xS(hovered)} y={M.top + 18} textAnchor="middle" fill="var(--text)" fontSize="9" fontWeight="600">{data[hovered].label}</text>
              <text x={xS(hovered)} y={M.top + 31} textAnchor="middle" fill="var(--primary)" fontSize="11" fontWeight="700">{data[hovered].count} artifacts</text>
              {maDotIdx !== null && (
                <text x={xS(hovered) + 54} y={M.top + 18} textAnchor="start" fill="var(--secondary)" fontSize="8.5">{data[hovered].ma7} avg</text>
              )}
            </g>
          )}

          {/* Bar hover */}
          {hovered !== null && chartType === 'bar' && (
            <g>
              <rect x={xS(hovered) - 54} y={M.top + 4} width="108" height="36" rx="6" fill="var(--card-bg)" stroke="var(--border)" strokeWidth="1" />
              <text x={xS(hovered)} y={M.top + 18} textAnchor="middle" fill="var(--text)" fontSize="9" fontWeight="600">{data[hovered].label}</text>
              <text x={xS(hovered)} y={M.top + 31} textAnchor="middle" fill="var(--primary)" fontSize="11" fontWeight="700">{data[hovered].count}</text>
            </g>
          )}
        </svg>
      </div>
      {chartType !== 'bar' && (
        <div className="velocity-legend">
          <span className="velocity-legend-item">
            <span className="velocity-legend-line" style={{ background: 'var(--primary)' }} />
            Daily Count
          </span>
          <span className="velocity-legend-item">
            <span className="velocity-legend-line velocity-legend-line--dashed" style={{ background: 'var(--secondary)' }} />
            7-Day Moving Average
          </span>
        </div>
      )}
    </div>
  );
}

function VelocityChartFull({ dailyVelocity, filterEnv, chartType, onChartTypeChange, brushRange, onBrush }) {
  const [hovered, setHovered] = useState(null);
  const [isBrushing, setIsBrushing] = useState(false);
  const [brushStart, setBrushStart] = useState(null);
  const [brushEnd, setBrushEnd] = useState(null);
  const svgRef = useRef(null);

  const { data, maxCount, total, avg } = useMemo(() => {
    const days = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push({
        date: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        count: 0, ma7: null,
      });
    }
    for (const entry of dailyVelocity || []) {
      if (filterEnv && entry.env !== filterEnv) continue;
      const day = days.find(d => d.date === entry.date);
      if (day) day.count += entry.count;
    }
    for (let i = 0; i < days.length; i++) {
      if (i >= 6) {
        let sum = 0;
        for (let j = i - 6; j <= i; j++) sum += days[j].count;
        days[i].ma7 = Math.round((sum / 7) * 10) / 10;
      }
    }
    return {
      data: days,
      maxCount: Math.max(...days.map(d => d.count), 1),
      total: days.reduce((s, d) => s + d.count, 0),
      avg: Math.round((days.reduce((s, d) => s + d.count, 0) / 30) * 10) / 10,
    };
  }, [dailyVelocity, filterEnv]);

  const M = { top: 30, right: 24, bottom: 36, left: 50 };
  const W = 1200, H = 380;
  const cw = W - M.left - M.right;
  const ch = H - M.top - M.bottom;

  const xS = (i) => M.left + (data.length > 1 ? (i / (data.length - 1)) * cw : cw / 2);
  const yS = (v) => M.top + ch - (v / maxCount) * ch;
  const baseY = M.top + ch;
  const colW = cw / data.length;

  const pts = data.map((d, i) => ({ x: xS(i), y: yS(d.count) }));
  const linePath = pts.length > 1 ? `M${pts.map(p => `${p.x},${p.y}`).join(' L')}` : '';

  const maPts = data.filter(d => d.ma7 !== null).map(d => {
    const idx = data.indexOf(d);
    return { x: xS(idx), y: yS(d.ma7) };
  });
  const maPath = maPts.length > 1 ? `M${maPts.map(p => `${p.x},${p.y}`).join(' L')}` : '';

  const grids = Array.from({ length: 7 }, (_, i) => {
    const r = i / 6;
    return { y: M.top + ch - r * ch, label: Math.round(maxCount * r) };
  });

  const xLabels = data.filter((_, i) => i % 3 === 0 || i === data.length - 1);

  const getIdxFromX = useCallback((clientX) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * W;
    let minDist = Infinity;
    let idx = null;
    for (let i = 0; i < data.length; i++) {
      const d = Math.abs(xS(i) - svgX);
      if (d < minDist) { minDist = d; idx = i; }
    }
    return idx;
  }, [data, xS, W]);

  const handleMouseDown = (e) => {
    const idx = getIdxFromX(e.clientX);
    if (idx === null) return;
    setIsBrushing(true);
    setBrushStart(idx);
    setBrushEnd(idx);
  };

  const handleMouseMove = (e) => {
    if (!isBrushing) return;
    const idx = getIdxFromX(e.clientX);
    if (idx !== null) setBrushEnd(idx);
  };

  const handleMouseUp = () => {
    if (!isBrushing) return;
    setIsBrushing(false);
    if (brushStart !== null && brushEnd !== null) {
      const low = Math.min(brushStart, brushEnd);
      const high = Math.max(brushStart, brushEnd);
      if (high - low >= 1) {
        onBrush({ startIdx: low, endIdx: high, startDate: data[low].date, endDate: data[high].date });
      } else {
        onBrush(null);
      }
    }
    setBrushStart(null);
    setBrushEnd(null);
  };

  const brushLow = brushRange ? brushRange.startIdx : (brushStart !== null && brushEnd !== null ? Math.min(brushStart, brushEnd) : null);
  const brushHigh = brushRange ? brushRange.endIdx : (brushStart !== null && brushEnd !== null ? Math.max(brushStart, brushEnd) : null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {[
            { key: 'bar', icon: '▨' },
            { key: 'line', icon: '╱' },
            { key: 'area', icon: '◢' },
          ].map(t => (
            <button key={t.key} className={`chart-toggle-btn ${chartType === t.key ? 'active' : ''}`}
              onClick={() => onChartTypeChange(t.key)} style={{ fontSize: '0.85rem', padding: '0.35rem 0.85rem' }}>{t.icon} {t.key}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span className="velocity-stat">{total} this month</span>
          <span className="velocity-stat">{avg}/day avg</span>
          {brushRange && (
            <button className="velocity-stat" onClick={() => onBrush(null)} style={{ cursor: 'pointer', borderColor: 'var(--primary)', color: 'var(--primary)' }}>
              ✕ Clear brush
            </button>
          )}
        </div>
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', flex: 1 }}
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
      >
        <defs>
          <linearGradient id="veloGradFull" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="veloGradBarFull" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.6" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        {grids.map((g, i) => (
          <g key={i}>
            <line x1={M.left} y1={g.y} x2={W - M.right} y2={g.y} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />
            <text x={M.left - 6} y={g.y + 4} textAnchor="end" fill="var(--text-muted)" fontSize="11">{g.label}</text>
          </g>
        ))}
        {brushLow !== null && brushHigh !== null && (
          <rect x={xS(brushLow) - colW / 2} y={M.top} width={xS(brushHigh) - xS(brushLow) + colW} height={ch}
            fill="var(--primary)" opacity="0.08" rx="4" />
        )}
        {chartType === 'bar' ? (
          data.map((d, i) => {
            const barW = colW * 0.55;
            return (
              <rect key={i} x={xS(i) - barW / 2} y={yS(d.count)} width={barW} height={d.count > 0 ? yS(0) - yS(d.count) : 0}
                fill="url(#veloGradBarFull)" rx="3" />
            );
          })
        ) : chartType === 'area' ? (
          <>
            {data.length > 1 && <path d={`M${pts[0].x},${baseY} L${pts.map(p => `${p.x},${p.y}`).join(' L')} L${pts[pts.length - 1].x},${baseY} Z`} fill="url(#veloGradFull)" />}
            {linePath && <path d={linePath} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
          </>
        ) : (
          linePath && <path d={linePath} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {maPath && chartType !== 'bar' && (
          <path d={maPath} fill="none" stroke="var(--secondary)" strokeWidth="2" strokeDasharray="6 4" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {xLabels.map((d, i) => {
          const idx = data.indexOf(d);
          return (
            <text key={i} x={xS(idx)} y={H - 6} textAnchor="middle" fill="var(--text-muted)" fontSize="10">{d.label}</text>
          );
        })}
        {data.map((d, i) => (
          <rect key={i} x={xS(i) - colW / 2} y={M.top} width={colW} height={ch} fill="transparent"
            onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} />
        ))}
        {hovered !== null && (
          <g>
            <line x1={xS(hovered)} y1={M.top} x2={xS(hovered)} y2={baseY} stroke="var(--primary)" strokeWidth="1" strokeDasharray="3 3" opacity="0.3" />
            <circle cx={xS(hovered)} cy={yS(data[hovered].count)} r="5" fill="var(--primary)" stroke="var(--card-bg)" strokeWidth="2.5" />
            <rect x={xS(hovered) - 60} y={M.top + 6} width="120" height="44" rx="8" fill="var(--card-bg)" stroke="var(--border)" strokeWidth="1" />
            <text x={xS(hovered)} y={M.top + 22} textAnchor="middle" fill="var(--text)" fontSize="11" fontWeight="600">{data[hovered].label}</text>
            <text x={xS(hovered)} y={M.top + 38} textAnchor="middle" fill="var(--primary)" fontSize="14" fontWeight="700">{data[hovered].count} artifacts</text>
          </g>
        )}
      </svg>
      {chartType !== 'bar' && (
        <div className="velocity-legend" style={{ paddingTop: '0.5rem' }}>
          <span className="velocity-legend-item"><span className="velocity-legend-line" style={{ background: 'var(--primary)' }} /> Daily Count</span>
          <span className="velocity-legend-item"><span className="velocity-legend-line velocity-legend-line--dashed" style={{ background: 'var(--secondary)' }} /> 7-Day Moving Average</span>
        </div>
      )}
    </div>
  );
}

function TopApis({ topApisData, filterEnv }) {
  const tops = useMemo(() => {
    let data = topApisData || [];
    if (filterEnv) {
      data = data.filter((d) => d.env === filterEnv);
    }
    const map = {};
    for (const d of data) {
      map[d.apiName] = (map[d.apiName] || 0) + d.count;
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [topApisData, filterEnv]);

  if (tops.length === 0) return null;
  const max = tops[0][1];
  return (
    <div className="chart-container">
      <h3 className="chart-title">Top APIs{filterEnv ? ` (${filterEnv})` : ''}</h3>
      <div className="topapi-list">
        {tops.map(([name, count]) => (
          <div key={name} className="topapi-row">
            <span className="topapi-name">{name}</span>
            <div className="topapi-bar-track">
              <div className="topapi-bar-fill" style={{ width: `${(count / max) * 100}%` }} />
            </div>
            <span className="topapi-count">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const TOOLS = [
  { path: '/cipher', icon: '🔐', name: 'Cipher Tool', desc: 'AES encryption/decryption with GCM and CBC modes.' },
  { path: '/artifacts', icon: '💎', name: 'Artifacts', desc: 'Generate structured documentation packages and ZIP archives.' },
  { path: '/library', icon: '📚', name: 'API Library', desc: 'Browse, search, and re-download past artifact configurations.' },
  { path: '/credentials', icon: '🔑', name: 'Credentials', desc: 'Manage secrets for DEV, UAT, and PROD environments.' },
  { href: 'https://sharedclip.netlify.app/', icon: '📋', name: 'SharedClip', desc: 'Real-time collaborative clipboard for teams.', external: true },
];

export default function HomePage({ theme, toggleTheme }) {
  const [recent, setRecent] = useState([]);
  const [envData, setEnvData] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [credStats, setCredStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [dailyVelocity, setDailyVelocity] = useState([]);
  const [velocity, setVelocity] = useState([]);
  const [topApis, setTopApis] = useState([]);
  const [range, setRange] = useState('all');
  const [filterEnv, setFilterEnv] = useState(null);
  const [brushRange, setBrushRange] = useState(null);
  const [filterDate, setFilterDate] = useState(null);
  const [fullScreenChart, setFullScreenChart] = useState(null);
  const [velocityType, setVelocityType] = useState('area');
  const [donutType, setDonutType] = useState('donut');

  useEffect(() => {
    Promise.all([
      fetchArtifactStats(),
      Promise.all(ENVS.map((e) =>
        fetchCredentials(e).then((r) => [e, r.credentials || []]).catch(() => [e, []])
      )),
      fetchExtractedCredentials().catch(() => ({ credentials: {} })),
    ]).then(([stats, credRes, extractedRes]) => {
      setRecent(stats.recent || []);
      setTotalCount(stats.total || 0);
      setEnvData(Object.entries(stats.envCounts || {}).map(([label, value]) => ({ label, value })));
      setActivity(stats.activity || []);
      setDailyVelocity(stats.dailyVelocity || []);
      setVelocity(stats.velocity || []);
      setTopApis(stats.topApis || []);
      const credMap = Object.fromEntries(credRes);
      const extracted = extractedRes.credentials || {};
      const merged = {};
      for (const env of ENVS) {
        merged[env] = [...(credMap[env] || []), ...(extracted[env] || [])];
      }
      setCredStats(merged);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const filteredActivity = React.useMemo(() => {
    let data = activity;
    if (range !== 'all' && activity.length) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - (range === '7d' ? 7 : 30));
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      data = activity.filter((d) => d.date >= cutoffStr);
    }
    if (brushRange) {
      data = activity.filter((d) => d.date >= brushRange.startDate && d.date <= brushRange.endDate);
    }
    if (filterDate) {
      data = activity.filter((d) => d.date === filterDate);
    }
    return data;
  }, [activity, range, brushRange, filterDate]);

  const filteredVelocity = React.useMemo(() => {
    let data = velocity;
    if (range !== 'all' && velocity.length) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - (range === '7d' ? 7 : 30));
      const cutoffMonth = cutoff.toISOString().slice(0, 7);
      data = velocity.filter((d) => d.month >= cutoffMonth);
    }
    if (brushRange) {
      const startMonth = brushRange.startDate.slice(0, 7);
      const endMonth = brushRange.endDate.slice(0, 7);
      data = velocity.filter((d) => d.month >= startMonth && d.month <= endMonth);
    }
    if (filterEnv) {
      data = velocity.filter((d) => d.env === filterEnv);
    }
    return data;
  }, [velocity, range, brushRange, filterEnv]);

  const filteredDailyVelocity = React.useMemo(() => {
    let data = dailyVelocity;
    if (range !== 'all' && dailyVelocity.length) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - (range === '7d' ? 7 : 30));
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      data = dailyVelocity.filter((d) => d.date >= cutoffStr);
    }
    if (brushRange) {
      data = dailyVelocity.filter((d) => d.date >= brushRange.startDate && d.date <= brushRange.endDate);
    }
    if (filterEnv) {
      data = dailyVelocity.filter((d) => d.env === filterEnv);
    }
    return data;
  }, [dailyVelocity, range, brushRange, filterEnv]);

  const rangeEnvData = React.useMemo(() => {
    const map = {};
    for (const d of filteredVelocity) {
      map[d.env] = (map[d.env] || 0) + d.count;
    }
    if (Object.keys(map).length === 0) {
      for (const d of envData) map[d.label] = d.value;
    }
    return Object.entries(map).map(([label, value]) => ({ label, value }));
  }, [filteredVelocity, envData]);

  const filteredTopApis = React.useMemo(() => {
    let data = topApis;
    if (filterEnv) {
      data = topApis.filter((d) => d.env === filterEnv);
    }
    return data;
  }, [topApis, filterEnv]);

  const rangeRecent = React.useMemo(() => {
    if (filterEnv) return recent.filter((a) => a.env === filterEnv);
    return recent;
  }, [recent, filterEnv]);

  const handleDonutFilter = (env) => {
    setFilterEnv(env);
  };

  const handleBrush = (range) => {
    setBrushRange(range);
  };

  const handleDateFilter = (date) => {
    setFilterDate(date);
    if (date) setRange('all');
  };

  const handleFullScreen = (chartId) => {
    setFullScreenChart(chartId);
  };

  useEffect(() => {
    if (fullScreenChart) {
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') setFullScreenChart(null);
      });
    }
  }, [fullScreenChart]);

  return (
    <div className="home-layout">
      <aside className="home-sidebar">
        <div className="sidebar-brand">
          <h2>AMLI</h2>
        </div>
        <nav className="sidebar-nav">
          {TOOLS.map((tool) => {
            const content = (
              <>
                <span className="sidebar-icon">{tool.icon}</span>
                <div className="sidebar-item-text">
                  <span className="sidebar-item-name">{tool.name}</span>
                  <span className="sidebar-item-desc">{tool.desc}</span>
                </div>
              </>
            );
            if (tool.external) {
              return (
                <a key={tool.name} href={tool.href} target="_blank" rel="noopener noreferrer" className="sidebar-link">
                  {content}
                </a>
              );
            }
            return (
              <Link key={tool.name} to={tool.path} className="sidebar-link">
                {content}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <button className="theme-toggle sidebar-theme-btn" onClick={toggleTheme}>
            {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
          </button>
        </div>
      </aside>

      <main className="home-main">
        <div className="home-container">
          <section className="hero-section">
            <h1>DASHBOARD</h1>
            <p>
              A suite of professional encryption, decryption, and artifact
              management tools designed for speed, security, and developer
              productivity.
            </p>
          </section>

          <div className="dashboard-stats">
            {!loaded ? (
              <>
                <SkeletonStatCard />
                <SkeletonStatCard />
                <SkeletonStatCard />
                <SkeletonStatCard />
                <SkeletonStatCard />
              </>
            ) : (
              <>
                {rangeEnvData.map((d) => (
                  <div key={d.label} className="stat-card" style={{ cursor: 'pointer', opacity: filterEnv && filterEnv !== d.label ? 0.4 : 1 }}
                    onClick={() => setFilterEnv(filterEnv === d.label ? null : d.label)}>
                    <div className="stat-card-icon">{ENV_ICONS[d.label]}</div>
                    <span className="stat-value">{d.value}</span>
                    <span className="stat-label">{d.label}</span>
                  </div>
                ))}
                <Link to="/library" className="stat-card stat-card--link">
                  <div className="stat-card-icon">📚</div>
                  <span className="stat-value">{totalCount}</span>
                  <span className="stat-label">Total Artifacts</span>
                </Link>
                <Link to="/credentials" className="stat-card stat-card--link">
                  <div className="stat-card-icon">🔑</div>
                  <span className="stat-value">
                    {credStats ? Object.values(credStats).reduce((s, c) => s + c.length, 0) : '--'}
                  </span>
                  <span className="stat-label">Credentials</span>
                </Link>
              </>
            )}
          </div>

          <div className="range-bar">
            <span className="range-bar-label">Show:</span>
            {[
              { key: '7d', label: '7 Days' },
              { key: '30d', label: '30 Days' },
              { key: 'all', label: 'All Time' },
            ].map((r) => (
              <button
                key={r.key}
                className={`range-btn ${range === r.key ? 'active' : ''}`}
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </button>
            ))}
            {filterEnv && <FilterChip label={filterEnv} onClear={() => setFilterEnv(null)} />}
            {brushRange && (
              <FilterChip label={`${brushRange.startDate} – ${brushRange.endDate}`} onClear={() => setBrushRange(null)} />
            )}
            {filterDate && <FilterChip label={filterDate} onClear={() => setFilterDate(null)} />}
          </div>

          {!loaded ? (
            <>
              <div className="chart-section">
                <SkeletonChart />
              </div>
              <div className="chart-grid-2">
                <div className="chart-section"><SkeletonChart /></div>
                <div className="chart-section"><SkeletonChart /></div>
              </div>
            </>
          ) : (
            <>
              <div className="chart-grid-2">
                <div className="chart-section">
                  <ChartToolbar title="Environment Distribution" chartType={donutType} onChartTypeChange={setDonutType}
                    onFullscreen={() => handleFullScreen('donut')} stats={null} />
                  <DonutChart data={rangeEnvData} activeFilter={filterEnv} onFilterChange={handleDonutFilter} chartType={donutType} />
                </div>
                <div className="chart-section">
                  <VelocityChart dailyVelocity={filteredDailyVelocity} chartType={velocityType} onChartTypeChange={setVelocityType}
                    brushRange={brushRange} onBrush={handleBrush}
                    onFullscreen={() => handleFullScreen('velocity')} />
                </div>
              </div>
              {credStats && (
                <div className="chart-grid-2">
                  <div className="chart-section">
                    <TopApis topApisData={filteredTopApis} filterEnv={filterEnv} />
                  </div>
                  <div className="chart-section">
                    <div className="chart-container">
                      <h3 className="chart-title">Credentials by Environment{filterEnv ? ` (${filterEnv})` : ''}</h3>
                      <div className="cred-stats-grid">
                        {(filterEnv ? [filterEnv] : ENVS).map((env) => {
                          const list = credStats[env] || [];
                          const manual = list.filter((c) => c._source !== 'artifact').length;
                          const extracted = list.filter((c) => c._source === 'artifact').length;
                          return (
                            <div key={env} className="cred-stat-card" style={{ borderLeftColor: ENV_COLORS[env] }}>
                              <div className="cred-stat-header">
                                <span>{ENV_ICONS[env]}</span>
                                <span style={{ fontWeight: 700 }}>{env}</span>
                              </div>
                              <div className="cred-stat-total">{list.length}</div>
                              <div className="cred-stat-breakdown">
                                <span>📝 {manual} manual</span>
                                <span>🔍 {extracted} extracted</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="chart-section cal-section">
            <ActivityCalendar activity={filteredActivity} filterDate={filterDate} onDateFilter={handleDateFilter} />
          </div>

          <div className="recent-section">
            <h2 className="recent-title">Recent Artifacts{filterEnv ? ` (${filterEnv})` : ''}</h2>
            {!loaded ? (
              <div className="recent-grid">
                <SkeletonRecentCard />
                <SkeletonRecentCard />
                <SkeletonRecentCard />
              </div>
            ) : rangeRecent.length > 0 ? (
              <div className="recent-grid">
                {rangeRecent.map((art) => (
                  <Link key={art.id} to="/library" className="recent-card">
                    <div className="recent-card-top">
                      <span className="badge-env" data-env={art.env}>
                        {art.env || 'DEV'}
                      </span>
                      <span className="recent-date">
                        {toDate(art.timestamp)?.toLocaleDateString('en-IN', {
                          day: '2-digit', month: 'short',
                        }) || ''}
                      </span>
                    </div>
                    <div className="recent-card-body">
                      <strong>{art.apiName || 'Unnamed'}</strong>
                      <span className="recent-ticket">{art.jiraTicket}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                No artifacts in this period.
              </p>
            )}
          </div>

          <footer className="footer-minimal">
            Built by <strong>Dikshit Sharma</strong> | dikshit.sharma2580@gmail.com
          </footer>
        </div>
      </main>

      {fullScreenChart && (
        <div className="fullscreen-chart-overlay" onClick={() => setFullScreenChart(null)}>
          <div className="fullscreen-chart-content" onClick={(e) => e.stopPropagation()}>
            <div className="fullscreen-chart-header">
              <h2>{fullScreenChart === 'velocity' ? 'Artifact Generation Velocity' : 'Environment Distribution'}</h2>
              <button className="fullscreen-chart-close" onClick={() => setFullScreenChart(null)}>✕</button>
            </div>
            <div className="fullscreen-chart-body">
              {fullScreenChart === 'velocity' ? (
                <VelocityChartFull dailyVelocity={filteredDailyVelocity} chartType={velocityType} onChartTypeChange={setVelocityType}
                  brushRange={brushRange} onBrush={handleBrush} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3rem', height: '100%' }}>
                  <svg width="320" height="320" viewBox="0 0 360 360" style={{ flexShrink: 0 }}>
                    <defs>
                      {ENVS.map((env) => (
                        <filter key={env} id={`glow-${env}`}>
                          <feGaussianBlur stdDeviation="3" result="blur" />
                          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                      ))}
                    </defs>
                    <circle cx="180" cy="180" r="130" fill="none" stroke="var(--border)" strokeWidth="30" />
                    {(() => {
                      const total = rangeEnvData.reduce((s, d) => s + d.value, 0);
                      if (total === 0) return null;
                      const circ = 2 * Math.PI * 130;
                      let off = 0;
                      return rangeEnvData.map((d) => {
                        const seg = (d.value / total) * circ;
                        const dash = `${seg} ${circ - seg}`;
                        const isActive = filterEnv === d.label;
                        const el = (
                          <circle key={d.label} cx="180" cy="180" r="130" fill="none"
                            stroke={ENV_COLORS[d.label]} strokeWidth={isActive ? 34 : 30}
                            strokeDasharray={dash} strokeDashoffset={-off}
                            strokeLinecap="round" filter={isActive ? `url(#glow-${d.label})` : undefined}
                            style={{ transition: 'stroke-dashoffset 0.6s ease, stroke-width 0.2s ease', cursor: 'pointer', opacity: filterEnv && !isActive ? 0.3 : 1 }}
                            onClick={() => setFilterEnv(isActive ? null : d.label)} />
                        );
                        off += seg;
                        return el;
                      });
                    })()}
                  </svg>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {rangeEnvData.map((d) => (
                      <div key={d.label} className="donut-legend-item" style={{ cursor: 'pointer', opacity: filterEnv && filterEnv !== d.label ? 0.4 : 1 }}
                        onClick={() => setFilterEnv(filterEnv === d.label ? null : d.label)}>
                        <span className="donut-dot" style={{ width: 14, height: 14, background: ENV_COLORS[d.label] }} />
                        <span className="donut-label" style={{ fontSize: '1rem', width: 60 }}>{d.label}</span>
                        <span className="donut-value" style={{ fontSize: '1.1rem' }}>{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
