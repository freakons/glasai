import Link from 'next/link';
import type { Signal } from '@/data/mockSignals';
import type { FundingRound } from '@/lib/data/funding';
import type { AIModel } from '@/lib/data/models';
import type { ActiveEntity, EcosystemSnapshot } from '@/db/queries';
import { SignalImpactBadge } from '@/components/signals/SignalImpactBadge';
import { HeatIndicator } from '@/components/intelligence/HeatIndicator';
import { computeSectionHeat } from '@/lib/intelligence/heatScore';

// ─────────────────────────────────────────────────────────────────────────────
// Sub-section renderers
// ─────────────────────────────────────────────────────────────────────────────

function SignalRow({ signal }: { signal: Signal }) {
  const cat = signal.category ?? 'signal';
  return (
    <Link href={`/intelligence/signal/${signal.id}`} className="eco-row">
      <span className="eco-cat" data-cat={cat}>{cat}</span>
      <span className="eco-title">{signal.title}</span>
      <SignalImpactBadge
        signal={{
          significanceScore: signal.significanceScore,
          confidenceScore: signal.confidence,
          sourceSupportCount: signal.sourceSupportCount,
          affectedEntitiesCount: signal.context?.affectedEntities?.length ?? null,
        }}
        showLabel={false}
      />
      <span className="eco-meta">{signal.entityName}</span>
    </Link>
  );
}

function EntityRow({ entity }: { entity: ActiveEntity }) {
  return (
    <div className="eco-row">
      <span className="eco-title">{entity.name}</span>
      <span className="eco-count">{entity.signalCount} signals</span>
    </div>
  );
}

function FundingRow({ round }: { round: FundingRound }) {
  return (
    <div className="eco-row">
      <span className="eco-title">{round.company}</span>
      <span className="eco-meta">{round.amount} · {round.round}</span>
    </div>
  );
}

function ModelRow({ model }: { model: AIModel }) {
  return (
    <div className="eco-row">
      <span className="eco-title">{model.name}</span>
      <span className="eco-meta">{model.company} · {model.releaseDate}</span>
    </div>
  );
}

function EmptyState() {
  return <p className="eco-empty">No activity detected.</p>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface EcosystemActivityProps {
  snapshot: EcosystemSnapshot;
}

export function EcosystemActivity({ snapshot }: EcosystemActivityProps) {
  const { topSignals, mostActiveEntities, recentFunding, modelReleases } = snapshot;

  const hasAnyData =
    topSignals.length > 0 ||
    mostActiveEntities.length > 0 ||
    recentFunding.length > 0 ||
    modelReleases.length > 0;

  if (!hasAnyData) return null;

  const heat = computeSectionHeat(snapshot);

  return (
    <section className="eco-section">
      <div className="eco-header">
        <h2 className="eco-heading">Ecosystem Activity</h2>
        <span className="eco-badge">Overview</span>
      </div>

      <div className="eco-grid">
        {/* ── Top Signals ──────────────────────────────────────────── */}
        <div className="eco-panel">
          <div className="eco-panel-header">
            <h3 className="eco-panel-title">Top Signals</h3>
            <HeatIndicator level={heat.topSignals} />
          </div>
          {topSignals.length > 0
            ? topSignals.map((s) => <SignalRow key={s.id} signal={s} />)
            : <EmptyState />}
        </div>

        {/* ── Most Active Entities ─────────────────────────────────── */}
        <div className="eco-panel">
          <div className="eco-panel-header">
            <h3 className="eco-panel-title">Most Active Entities</h3>
            <HeatIndicator level={heat.mostActiveEntities} />
          </div>
          {mostActiveEntities.length > 0
            ? mostActiveEntities.map((e) => <EntityRow key={e.name} entity={e} />)
            : <EmptyState />}
        </div>

        {/* ── Recent Funding ───────────────────────────────────────── */}
        <div className="eco-panel">
          <div className="eco-panel-header">
            <h3 className="eco-panel-title">Recent Funding</h3>
            <HeatIndicator level={heat.recentFunding} />
          </div>
          {recentFunding.length > 0
            ? recentFunding.map((f) => <FundingRow key={f.id} round={f} />)
            : <EmptyState />}
        </div>

        {/* ── Model Releases ───────────────────────────────────────── */}
        <div className="eco-panel">
          <div className="eco-panel-header">
            <h3 className="eco-panel-title">Model Releases</h3>
            <HeatIndicator level={heat.modelReleases} />
          </div>
          {modelReleases.length > 0
            ? modelReleases.map((m) => <ModelRow key={m.id} model={m} />)
            : <EmptyState />}
        </div>
      </div>
    </section>
  );
}
