import { Badge } from '@/components/ui/Badge';
import type { SignalWithRankMeta } from '@/lib/signals/feedComposer';

interface SignalCardProps {
  signal: SignalWithRankMeta;
}

/**
 * SignalCard — Intelligence feed card with significance and corroboration
 * indicators.  Renders signals from the composed feed with visual cues
 * for importance level and source coverage.
 *
 * Preserves the existing .nc card design while adding:
 *   - Significance tier indicator (critical/high/standard)
 *   - Source corroboration count
 *   - "Why it matters" context when available
 */
export function SignalCard({ signal }: SignalCardProps) {
  const tier = signal._significanceTier ?? 'standard';
  const sourceCount = signal._sourceCount ?? signal.sourceSupportCount;

  return (
    <div className={`nc${tier === 'critical' ? ' nc-critical' : tier === 'high' ? ' nc-high' : ''}`}>
      <div className="nc-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Badge category={signal.category} />
          {tier === 'critical' && (
            <span className="sig-badge sig-critical">Major</span>
          )}
          {tier === 'high' && (
            <span className="sig-badge sig-high">Notable</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {sourceCount != null && sourceCount > 1 && (
            <span className="corroboration-badge" title={`Corroborated by ${sourceCount} sources`}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--emerald-l)', display: 'inline-block' }} />
              {sourceCount} sources
            </span>
          )}
          {signal.confidence >= 90 && (
            <span className="verified">
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--emerald-l)', display: 'inline-block' }} />
              Verified
            </span>
          )}
        </div>
      </div>
      <div className="nc-title">{signal.title}</div>
      <div className="nc-body">{signal.summary}</div>
      {signal.context?.whyItMatters && (
        <div className="nc-why">
          {signal.context.whyItMatters}
        </div>
      )}
      <div className="nc-foot">
        <span className="nc-src">
          <span style={{ width: 3.5, height: 3.5, borderRadius: '50%', background: 'var(--indigo-l)', display: 'inline-block' }} />
          {signal.entityName || 'Intelligence'}
        </span>
        <span>{formatSignalDate(signal.date)}</span>
      </div>
    </div>
  );
}

function formatSignalDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}
