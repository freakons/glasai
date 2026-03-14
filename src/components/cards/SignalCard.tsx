import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import type { SignalWithRankMeta } from '@/lib/signals/feedComposer';
import type { SignalExplanation } from '@/lib/signals/explanationLayer';

interface SignalWithExplanation extends SignalWithRankMeta {
  explanation?: SignalExplanation;
}

interface SignalCardProps {
  signal: SignalWithExplanation;
}

/**
 * SignalCard — Intelligence feed card with significance, corroboration,
 * and explanation indicators.  Renders signals from the composed feed
 * with visual cues for importance level, source coverage, and analyst
 * context.
 */
export function SignalCard({ signal }: SignalCardProps) {
  const tier = signal._significanceTier ?? 'standard';
  const sourceCount = signal._sourceCount ?? signal.sourceSupportCount;
  const explanation = signal.explanation;

  // Route to entity page if available, otherwise to signals browser
  const href = signal.entityId
    ? `/entity/${encodeURIComponent(signal.entityName || signal.entityId)}`
    : '/signals';

  return (
    <Link href={href} className="nc-link">
      <div className={`nc${tier === 'critical' ? ' nc-critical' : tier === 'high' ? ' nc-high' : ''}`}>
        {/* Top meta row */}
        <div className="nc-top">
          <div className="nc-badges">
            <Badge category={signal.category} />
            {tier === 'critical' && (
              <span className="sig-badge sig-critical">
                {explanation?.importanceLabel ?? 'Major'}
              </span>
            )}
            {tier === 'high' && (
              <span className="sig-badge sig-high">
                {explanation?.importanceLabel ?? 'Notable'}
              </span>
            )}
          </div>
          <div className="nc-indicators">
            {sourceCount != null && sourceCount > 1 && (
              <span
                className="corroboration-badge"
                title={explanation?.corroborationSummary ?? `Corroborated by ${sourceCount} sources`}
              >
                <span className="indicator-dot indicator-dot--emerald" />
                {sourceCount} sources
              </span>
            )}
            {signal.confidence >= 90 && (
              <span className="verified">
                <span className="indicator-dot indicator-dot--emerald" />
                {explanation?.confidenceLabel ?? 'Verified'}
              </span>
            )}
          </div>
        </div>

        {/* Title */}
        <h3 className="nc-title">{signal.title}</h3>

        {/* Summary */}
        <p className="nc-body">{signal.summary}</p>

        {/* Why it matters */}
        {(explanation?.whyThisMatters || signal.context?.whyItMatters) && (
          <div className="nc-why">
            <span className="nc-why-label">Why it matters</span>
            {explanation?.whyThisMatters ?? signal.context?.whyItMatters}
          </div>
        )}

        {/* Affected entities */}
        {explanation?.affectedEntities && explanation.affectedEntities.length > 1 && (
          <div className="nc-affected">
            <span className="nc-affected-label">Affects:</span> {explanation.affectedEntities.join(', ')}
          </div>
        )}

        {/* Footer */}
        <div className="nc-foot">
          <span className="nc-src">
            <span className="indicator-dot indicator-dot--indigo" />
            {signal.entityName || 'Intelligence'}
          </span>
          <span className="nc-date">{formatSignalDate(signal.date)}</span>
        </div>

        {/* Open signal affordance */}
        <span className="nc-open-hint">Open signal</span>
      </div>
    </Link>
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
