import type { Metadata } from 'next';
import { IntelligenceGraph } from '@/ui/graph/IntelligenceGraph';

export const metadata: Metadata = {
  title: 'AI Ecosystem Graph',
  description:
    'Interactive force-directed map of relationships between AI companies, events, and signals.',
};

const LEGEND = [
  { type: 'entity', label: 'Entity',  color: '#3b82f6' },
  { type: 'event',  label: 'Event',   color: '#f59e0b' },
  { type: 'signal', label: 'Signal',  color: '#10b981' },
] as const;

export default function GraphPage() {
  return (
    <>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          fontFamily: 'Instrument Serif, Georgia, serif',
          fontSize: 'clamp(1.6rem, 3vw, 2.25rem)',
          fontWeight: 400,
          color: 'var(--text)',
          marginBottom: 8,
          lineHeight: 1.2,
        }}>
          AI Ecosystem{' '}
          <span style={{ color: 'var(--cyan-l, #67e8f9)' }}>Graph</span>
        </h1>
        <p style={{
          color: 'var(--text2)',
          fontSize: '0.9rem',
          margin: 0,
          maxWidth: 520,
        }}>
          Force-directed map of AI companies, events, and signals.
          Hover a node to highlight its connections. Click to inspect.
        </p>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex',
        gap: 20,
        marginBottom: 16,
        flexWrap: 'wrap',
      }}>
        {LEGEND.map(({ label, color }) => (
          <div
            key={label}
            style={{ display: 'flex', alignItems: 'center', gap: 7 }}
          >
            <span style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: color,
              boxShadow: `0 0 8px ${color}`,
              flexShrink: 0,
            }} />
            <span style={{ fontSize: '0.78rem', color: 'var(--text2)', letterSpacing: '0.04em' }}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Graph panel */}
      <div style={{
        background: 'var(--glass, rgba(255,255,255,0.032))',
        border: '1px solid var(--border, rgba(255,255,255,0.065))',
        borderRadius: 12,
        overflow: 'hidden',
        minHeight: 620,
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
      }}>
        <IntelligenceGraph />
      </div>
    </>
  );
}
