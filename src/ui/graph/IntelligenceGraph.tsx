'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mockGraphData, type GraphNode, type GraphData } from '@/data/mockGraph';
import type { EntityProfile } from '@/data/mockEntities';

// Disable SSR — ForceGraph2D uses canvas and window APIs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ForceGraph2D = dynamic<any>(
  () => import('react-force-graph').then(mod => ({ default: mod.ForceGraph2D })),
  { ssr: false },
);

/** Colour per node type */
const NODE_COLORS: Record<GraphNode['type'], string> = {
  entity: '#3b82f6', // blue
  event:  '#f59e0b', // amber
  signal: '#10b981', // emerald
};

/** Node as enriched by force-graph at runtime */
type RuntimeNode = GraphNode & { x?: number; y?: number };
type RuntimeLink = { source: string | RuntimeNode; target: string | RuntimeNode };

function nodeId(n: string | RuntimeNode): string {
  return typeof n === 'object' ? n.id : n;
}

/** Build graph data from entity profiles (entity nodes only, no links). */
function buildGraphFromEntities(entities: EntityProfile[]): GraphData {
  if (entities.length === 0) return IS_PRODUCTION ? EMPTY_GRAPH : mockGraphData;

  const nodes: GraphNode[] = entities.map(e => ({
    id:    e.id,
    type:  'entity' as const,
    label: e.name,
  }));

  // Connect entities in the same sector
  const links: { source: string; target: string }[] = [];
  const bySector: Record<string, string[]> = {};
  for (const e of entities) {
    if (e.sector) {
      bySector[e.sector] = bySector[e.sector] ?? [];
      bySector[e.sector].push(e.id);
    }
  }
  for (const ids of Object.values(bySector)) {
    for (let i = 0; i < ids.length - 1; i++) {
      links.push({ source: ids[i], target: ids[i + 1] });
    }
  }

  return { nodes, links };
}

// ─────────────────────────────────────────────────────────────────────────────
// Data fetching
// ─────────────────────────────────────────────────────────────────────────────

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const EMPTY_GRAPH: GraphData = { nodes: [], links: [] };

async function fetchGraphData(): Promise<GraphData> {
  try {
    const res = await fetch('/api/entities', { next: { revalidate: 120 } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data.entities) && data.entities.length > 0) {
      return buildGraphFromEntities(data.entities as EntityProfile[]);
    }
    // In production, return empty graph instead of mock data
    return IS_PRODUCTION ? EMPTY_GRAPH : mockGraphData;
  } catch {
    return IS_PRODUCTION ? EMPTY_GRAPH : mockGraphData;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function IntelligenceGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<GraphData>(IS_PRODUCTION ? EMPTY_GRAPH : mockGraphData);

  // Fetch entity graph data on mount; silently keep mock data if it fails
  useEffect(() => {
    fetchGraphData().then(setGraphData);
  }, []);

  /** Set of node IDs connected to the hovered node */
  const neighbors = useMemo<Set<string>>(() => {
    if (!hoveredId) return new Set();
    const s = new Set<string>();
    for (const link of graphData.links) {
      const src = nodeId(link.source as string | RuntimeNode);
      const tgt = nodeId(link.target as string | RuntimeNode);
      if (src === hoveredId) s.add(tgt);
      if (tgt === hoveredId) s.add(src);
    }
    return s;
  }, [hoveredId, graphData.links]);

  /** Custom canvas renderer — draws glowing nodes with labels */
  const paintNode = useCallback(
    (node: RuntimeNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const color      = NODE_COLORS[node.type] ?? '#6366f1';
      const isHovered  = node.id === hoveredId;
      const isNeighbor = neighbors.has(node.id);
      const isDimmed   = !!hoveredId && !isHovered && !isNeighbor;
      const r          = isHovered ? 9 : 6;

      ctx.save();
      ctx.globalAlpha = isDimmed ? 0.18 : 1;

      // Glow
      ctx.shadowBlur  = isHovered ? 28 : 14;
      ctx.shadowColor = color;

      // Circle fill
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      // Border ring
      ctx.strokeStyle = isHovered ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)';
      ctx.lineWidth   = isHovered ? 1.5 : 0.75;
      ctx.stroke();

      ctx.shadowBlur = 0;

      // Label
      const fontSize       = Math.max(10, 11 / globalScale);
      ctx.font             = `500 ${fontSize}px DM Sans, sans-serif`;
      ctx.textAlign        = 'center';
      ctx.textBaseline     = 'top';
      ctx.fillStyle        = isHovered ? '#ffffff' : 'rgba(238,238,248,0.78)';
      ctx.fillText(node.label, node.x ?? 0, (node.y ?? 0) + r + 3);

      ctx.restore();
    },
    [hoveredId, neighbors],
  );

  const getLinkColor = useCallback(
    (link: RuntimeLink) => {
      if (!hoveredId) return 'rgba(255,255,255,0.1)';
      const src = nodeId(link.source as string | RuntimeNode);
      const tgt = nodeId(link.target as string | RuntimeNode);
      return src === hoveredId || tgt === hoveredId
        ? 'rgba(255,255,255,0.55)'
        : 'rgba(255,255,255,0.04)';
    },
    [hoveredId],
  );

  const getLinkWidth = useCallback(
    (link: RuntimeLink) => {
      if (!hoveredId) return 0.8;
      const src = nodeId(link.source as string | RuntimeNode);
      const tgt = nodeId(link.target as string | RuntimeNode);
      return src === hoveredId || tgt === hoveredId ? 2.5 : 0.4;
    },
    [hoveredId],
  );

  const handleNodeClick = useCallback((node: RuntimeNode) => {
    console.log('[IntelligenceGraph] node clicked:', node);
  }, []);

  const handleNodeHover = useCallback((node: RuntimeNode | null) => {
    setHoveredId(node?.id ?? null);
    if (containerRef.current) {
      containerRef.current.style.cursor = node ? 'pointer' : 'default';
    }
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', minHeight: 600 }}
    >
      <ForceGraph2D
        graphData={graphData}
        backgroundColor="transparent"
        nodeCanvasObject={paintNode}
        nodeCanvasObjectMode={() => 'replace'}
        nodeLabel="label"
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        linkColor={getLinkColor}
        linkWidth={getLinkWidth}
        cooldownTicks={120}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
      />
    </div>
  );
}
