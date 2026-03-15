/**
 * Omterminal — Signals Engine
 *
 * Transforms raw intelligence events into higher-order signals by detecting
 * patterns across multiple events within defined time windows.
 *
 * Signal types:
 *   CAPITAL_ACCELERATION  — ≥3 funding events within 14 days
 *   MODEL_RELEASE_WAVE    — ≥2 model_release events within 7 days
 *   REGULATION_ACTIVITY   — ≥2 regulation/policy events within 10 days
 *   RESEARCH_MOMENTUM     — ≥2 research_breakthrough events within 7 days
 *   COMPANY_EXPANSION     — ≥2 acquisition/partnership/product_launch/
 *                           company_strategy events within 10 days
 *
 * Pipeline position:
 *   RSS ingestion → normalization → event extraction → event store
 *   → signals engine → signal store
 */

import type { Event, Signal, SignalType, SignalDirection } from '@/types/intelligence';
import { type SignalMode, getModeConfig, DEFAULT_SIGNAL_MODE } from '@/lib/signals/signalModes';

// ─────────────────────────────────────────────────────────────────────────────
// Detection rule configuration
// ─────────────────────────────────────────────────────────────────────────────

interface DetectionRule {
  type: SignalType;
  /** Event types that count toward this signal */
  eventTypes: Event['type'][];
  /** Time window in milliseconds */
  windowMs: number;
  /** Minimum number of matching events to fire the signal */
  minCount: number;
  /** Directional implication for decision-makers */
  direction: SignalDirection;
}

const DETECTION_RULES: DetectionRule[] = [
  {
    type: 'CAPITAL_ACCELERATION',
    eventTypes: ['funding'],
    windowMs: 14 * 24 * 60 * 60 * 1000, // 14 days
    minCount: 3,
    direction: 'bullish',
  },
  {
    type: 'MODEL_RELEASE_WAVE',
    eventTypes: ['model_release'],
    windowMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    minCount: 2,
    direction: 'bullish',
  },
  {
    type: 'REGULATION_ACTIVITY',
    eventTypes: ['regulation', 'policy'],
    windowMs: 10 * 24 * 60 * 60 * 1000, // 10 days
    minCount: 2,
    direction: 'neutral',
  },
  {
    type: 'RESEARCH_MOMENTUM',
    eventTypes: ['research_breakthrough'],
    windowMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    minCount: 2,
    direction: 'bullish',
  },
  {
    type: 'COMPANY_EXPANSION',
    eventTypes: ['acquisition', 'partnership', 'product_launch', 'company_strategy'],
    windowMs: 10 * 24 * 60 * 60 * 1000, // 10 days
    minCount: 2,
    direction: 'bullish',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic ID based on signal type + sorted supporting event IDs. */
function generateSignalId(type: string, eventIds: string[]): string {
  const key = type + ':' + [...eventIds].sort().join(',');
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  return `sig_${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

/**
 * Find non-overlapping clusters of events within a sliding time window.
 * Returns groups where each group has at least `minCount` events spanning
 * no more than `windowMs` milliseconds from first to last event.
 *
 * Uses a greedy forward-scan: once a cluster is found starting at index i,
 * advances past all events consumed by that cluster.
 */
function findClusters(
  events: Event[],
  windowMs: number,
  minCount: number,
): Event[][] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const clusters: Event[][] = [];
  let start = 0;

  while (start < sorted.length) {
    const anchorTime = new Date(sorted[start].timestamp).getTime();

    // Collect all events within the window starting at this anchor
    const cluster: Event[] = [];
    for (let j = start; j < sorted.length; j++) {
      const t = new Date(sorted[j].timestamp).getTime();
      if (t - anchorTime <= windowMs) {
        cluster.push(sorted[j]);
      } else {
        break; // sorted, so no point checking further
      }
    }

    if (cluster.length >= minCount) {
      clusters.push(cluster);
      start += cluster.length; // advance past consumed events
    } else {
      start++;
    }
  }

  return clusters;
}

/**
 * Confidence score for a cluster.
 * Scales linearly between minCount (→ 0.60) and 2×minCount (→ 0.92),
 * capped at 0.95.
 */
function computeConfidence(clusterSize: number, minCount: number): number {
  const ratio = clusterSize / (minCount * 2);
  const raw = 0.60 + ratio * 0.35;
  return Math.min(Math.round(raw * 100) / 100, 0.95);
}

// ─────────────────────────────────────────────────────────────────────────────
// Title / description generators
// ─────────────────────────────────────────────────────────────────────────────

function buildTitle(type: SignalType, cluster: Event[]): string {
  const companies = [...new Set(cluster.map((e) => e.company))];
  const count = cluster.length;

  switch (type) {
    case 'CAPITAL_ACCELERATION':
      return `Frontier AI capital accelerating — ${count} funding rounds detected`;
    case 'MODEL_RELEASE_WAVE':
      return `Model release wave — ${count} releases in rapid succession`;
    case 'REGULATION_ACTIVITY':
      return `Regulatory activity surge — ${count} policy events in short window`;
    case 'RESEARCH_MOMENTUM':
      return `Research momentum building — ${count} breakthroughs in rapid succession`;
    case 'COMPANY_EXPANSION':
      return `Company expansion wave — ${count} strategic moves by ${companies.slice(0, 2).join(', ')}${companies.length > 2 ? ' and others' : ''}`;
  }
}

function buildDescription(type: SignalType, cluster: Event[], windowDays: number): string {
  const companies = [...new Set(cluster.map((e) => e.company))];
  const companiesStr = companies.slice(0, 5).join(', ');
  const timestamps = cluster
    .map((e) => new Date(e.timestamp))
    .sort((a, b) => a.getTime() - b.getTime());
  const from = timestamps[0].toISOString().split('T')[0];
  const to = timestamps[timestamps.length - 1].toISOString().split('T')[0];

  switch (type) {
    case 'CAPITAL_ACCELERATION':
      return (
        `${cluster.length} funding events were detected across ${companies.length} ` +
        `companies (${companiesStr}) between ${from} and ${to}, ` +
        `within the ${windowDays}-day acceleration window. ` +
        `This cluster indicates heightened investor conviction in AI.`
      );
    case 'MODEL_RELEASE_WAVE':
      return (
        `${cluster.length} model release events were detected from ` +
        `${companiesStr} between ${from} and ${to}, ` +
        `within a ${windowDays}-day window. ` +
        `Concurrent releases signal an intensifying capability race.`
      );
    case 'REGULATION_ACTIVITY':
      return (
        `${cluster.length} regulation or policy events were recorded between ${from} and ${to} ` +
        `(${windowDays}-day window), involving ${companiesStr}. ` +
        `A concentration of regulatory actions can reshape compliance requirements rapidly.`
      );
    case 'RESEARCH_MOMENTUM':
      return (
        `${cluster.length} research breakthrough events were identified from ` +
        `${companiesStr} between ${from} and ${to}, ` +
        `within a ${windowDays}-day window. ` +
        `Clustered breakthroughs often precede product advances.`
      );
    case 'COMPANY_EXPANSION':
      return (
        `${cluster.length} strategic expansion events (acquisitions, partnerships, or launches) ` +
        `were detected across ${companiesStr} between ${from} and ${to} ` +
        `(${windowDays}-day window), indicating a sector-wide push for market position.`
      );
  }
}

function buildRecommendation(type: SignalType): string {
  switch (type) {
    case 'CAPITAL_ACCELERATION':
      return 'Monitor which companies and sectors are attracting capital; consider strategic partnerships or competitive moves.';
    case 'MODEL_RELEASE_WAVE':
      return 'Evaluate capability gaps in your AI stack; benchmark new releases against your current tools.';
    case 'REGULATION_ACTIVITY':
      return 'Review compliance posture; engage legal counsel on emerging obligations in affected jurisdictions.';
    case 'RESEARCH_MOMENTUM':
      return 'Track research outputs for near-term productisation signals; prioritise R&D roadmap alignment.';
    case 'COMPANY_EXPANSION':
      return 'Assess competitive implications; identify partnership or acquisition opportunities before consolidation accelerates.';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the signals engine against an array of events.
 *
 * Applies each detection rule, finds qualifying event clusters, and returns
 * a Signal for every cluster that meets the threshold.  Signal IDs are
 * deterministic — re-running with the same events produces the same IDs,
 * enabling idempotent upserts downstream.
 *
 * The optional `mode` parameter adjusts the detection sensitivity via each
 * rule's engineMinCountMultiplier from the SignalModeConfig:
 *   raw      — multiplier 0.5 → lower cluster thresholds → more signals
 *   standard — multiplier 1.0 → default thresholds (unchanged behaviour)
 *   premium  — multiplier 1.0 → same generation as standard; stricter
 *              filtering is applied on the read path, not here
 *
 * @param events  Array of intelligence events (any recency).
 * @param mode    Signal quality mode for generation sensitivity (default: 'standard').
 * @returns       Array of generated Signals, ready for persistence.
 */
export function generateSignalsFromEvents(
  events: Event[],
  mode: SignalMode = DEFAULT_SIGNAL_MODE,
): Signal[] {
  if (events.length === 0) return [];

  const modeConfig = getModeConfig(mode);
  const multiplier = modeConfig.engineMinCountMultiplier;

  const signals: Signal[] = [];
  const now = new Date().toISOString();

  for (const rule of DETECTION_RULES) {
    // Apply mode-specific minCount: clamp to minimum of 1.
    const effectiveMinCount = Math.max(1, Math.floor(rule.minCount * multiplier));

    // Filter events matching this rule's event types
    const matching = events.filter((e) =>
      (rule.eventTypes as string[]).includes(e.type),
    );

    if (matching.length < effectiveMinCount) continue;

    // Find non-overlapping clusters within the time window
    const clusters = findClusters(matching, rule.windowMs, effectiveMinCount);
    const windowDays = Math.round(rule.windowMs / (24 * 60 * 60 * 1000));

    for (const cluster of clusters) {
      const eventIds = cluster.map((e) => e.id);
      const confidence = computeConfidence(cluster.length, effectiveMinCount);
      const affectedEntities = [...new Set(cluster.map((e) => e.company))];

      const signal: Signal = {
        id: generateSignalId(rule.type, eventIds),
        type: rule.type,
        title: buildTitle(rule.type, cluster),
        description: buildDescription(rule.type, cluster, windowDays),
        supportingEvents: eventIds,
        confidenceScore: confidence,
        direction: rule.direction,
        affectedEntities,
        recommendation: buildRecommendation(rule.type),
        createdAt: now,
        humanVerified: false,
      };

      signals.push(signal);
    }
  }

  console.log(`[signalEngine] mode=${mode} multiplier=${multiplier} detected=${signals.length} from ${events.length} events`);
  return signals;
}
