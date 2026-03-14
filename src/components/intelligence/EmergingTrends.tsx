import type { SignalCluster } from '@/lib/signals/clusterSignals';
import { TrendClusterCard } from './TrendClusterCard';

const SECTION_HEADER: React.CSSProperties = {
  fontFamily: 'var(--fm)',
  fontSize: 9,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--text3)',
  marginBottom: 4,
};

const SECTION_TITLE: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 600,
  color: 'var(--text)',
  lineHeight: 1.4,
};

const WRAPPER: React.CSSProperties = {
  marginBottom: 24,
};

const GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
  gap: 12,
  marginTop: 14,
};

interface EmergingTrendsProps {
  clusters: SignalCluster[];
}

/**
 * EmergingTrends — section that displays detected signal clusters
 * as emerging ecosystem trends above the main intelligence feed.
 */
export function EmergingTrends({ clusters }: EmergingTrendsProps) {
  if (clusters.length === 0) return null;

  return (
    <div style={WRAPPER}>
      <div style={SECTION_HEADER}>Auto-detected</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <p style={SECTION_TITLE}>Emerging Trends</p>
        <span style={{ fontSize: 11, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>
          {clusters.length} cluster{clusters.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div style={GRID}>
        {clusters.map((cluster) => (
          <TrendClusterCard key={cluster.id} cluster={cluster} />
        ))}
      </div>
    </div>
  );
}
