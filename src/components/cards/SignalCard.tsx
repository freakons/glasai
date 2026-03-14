'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { SignalImpactBadge } from '@/components/signals/SignalImpactBadge';
import { SignalMomentumBadge } from '@/components/signals/SignalMomentumBadge';
import { SignalContextPreview } from '@/components/signals/SignalContextPreview';
import { EntityQuickProfile } from '@/components/entity/EntityQuickProfile';
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
 * explanation indicators, and inline context preview.  Renders signals
 * from the composed feed with visual cues for importance level, source
 * coverage, and analyst context.
 */
export function SignalCard({ signal }: SignalCardProps) {
  const [previewOpen, setPreviewOpen] = useState(false);

  const tier = signal._significanceTier ?? 'standard';
  const sourceCount = signal._sourceCount ?? signal.sourceSupportCount;
  const explanation = signal.explanation;
  const context = signal.context ?? null;

  // Show preview toggle when context exists OR when we want to show the fallback
  const hasContextFields = Boolean(
    context?.whyItMatters || context?.implications?.length || context?.sourceBasis
  );

  // Route to signal detail page
  const href = `/signals/${encodeURIComponent(signal.id)}`;

  return (
    <div className={`nc${tier === 'critical' ? ' nc-critical' : tier === 'high' ? ' nc-high' : ''}`}>
      {/* Clickable area for navigation */}
      <Link href={href} className="nc-link">
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
            <SignalImpactBadge
              signal={{
                significanceScore: signal.significanceScore,
                confidenceScore: signal.confidence,
                sourceSupportCount: signal.sourceSupportCount,
                affectedEntitiesCount: signal.context?.affectedEntities?.length ?? null,
              }}
              showLabel={false}
            />
            {signal.momentum && (
              <SignalMomentumBadge momentum={signal.momentum} showLabel={false} />
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

        {/* Why it matters (inline, always visible if present) */}
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
      </Link>

      {/* Preview toggle — outside the Link to avoid navigation */}
      {(hasContextFields || context != null) && (
        <button
          className="nc-preview-toggle"
          onClick={(e) => {
            e.stopPropagation();
            setPreviewOpen((o) => !o);
          }}
          aria-expanded={previewOpen}
          aria-controls={`preview-${signal.id}`}
        >
          <span className={`nc-preview-chevron${previewOpen ? ' nc-preview-chevron--open' : ''}`}>
            ▾
          </span>
          {previewOpen ? 'Hide preview' : 'Preview'}
        </button>
      )}

      {/* Expandable context preview */}
      <div id={`preview-${signal.id}`}>
        <SignalContextPreview context={context} expanded={previewOpen} />
      </div>

      {/* Footer */}
      <div className="nc-foot">
        <span className="nc-src">
          <span className="indicator-dot indicator-dot--indigo" />
          {signal.entityName ? (
            <EntityQuickProfile entityName={signal.entityName}>
              {signal.entityName}
            </EntityQuickProfile>
          ) : (
            'Intelligence'
          )}
        </span>
        <Link href={href} className="nc-link">
          <span className="nc-date">{formatSignalDate(signal.date)}</span>
        </Link>
      </div>

      {/* Open signal affordance */}
      <Link href={href} className="nc-link">
        <span className="nc-open-hint">Open signal</span>
      </Link>
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
