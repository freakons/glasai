/**
 * /admin/system — Deployment diagnostics
 *
 * Server-rendered page that probes /api/health/db and /api/opportunities at
 * request time so developers can inspect the live deployment state without
 * needing direct database or log access.
 *
 * Both fetches use { cache: 'no-store' } so every page load reflects the
 * current state of the deployment.
 */

import { headers } from 'next/headers';

// ─────────────────────────────────────────────────────────────────────────────
// Types — mirror the API response shapes
// ─────────────────────────────────────────────────────────────────────────────

interface DbHealthResponse {
  status:    'ok' | 'error';
  database:  'connected' | 'not_connected';
  timestamp?: number;
  message?:  string;
}

interface OpportunitiesResponse {
  marketBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  signals:    unknown[];
  source:     'db' | 'mock' | 'db-empty';
  timestamp:  string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data fetching
// ─────────────────────────────────────────────────────────────────────────────

async function getBaseUrl(): Promise<string> {
  const hdrs = await headers();
  const host = hdrs.get('host') || 'localhost:3000';
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  return `${proto}://${host}`;
}

async function fetchDbHealth(base: string): Promise<DbHealthResponse> {
  try {
    const res = await fetch(`${base}/api/health/db`, { cache: 'no-store' });
    return res.json();
  } catch {
    return { status: 'error', database: 'not_connected', message: 'Fetch failed' };
  }
}

async function fetchOpportunities(base: string): Promise<OpportunitiesResponse | null> {
  try {
    const res = await fetch(`${base}/api/opportunities`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-mono font-semibold uppercase tracking-widest ring-1 ${
        ok
          ? 'bg-green-950/60 text-green-400 ring-green-500/30'
          : 'bg-red-950/60 text-red-400 ring-red-500/30'
      }`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${ok ? 'bg-green-400' : 'bg-red-400'}`}
      />
      {label}
    </span>
  );
}

function BiasChip({ bias }: { bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' }) {
  const styles = {
    BULLISH: 'bg-green-950/60 text-green-400 ring-green-500/30',
    BEARISH: 'bg-red-950/60   text-red-400   ring-red-500/30',
    NEUTRAL: 'bg-zinc-900     text-zinc-400  ring-zinc-600/30',
  } as const;
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-mono font-semibold uppercase tracking-widest ring-1 ${styles[bias]}`}
    >
      {bias}
    </span>
  );
}

function SourceChip({ source }: { source: 'db' | 'mock' | 'db-empty' }) {
  const styles = {
    db:       'bg-cyan-950/60  text-cyan-400   ring-cyan-500/30',
    mock:     'bg-amber-950/60 text-amber-400  ring-amber-500/30',
    'db-empty': 'bg-zinc-900   text-zinc-400   ring-zinc-600/30',
  } as const;
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-mono font-semibold uppercase tracking-widest ring-1 ${styles[source]}`}
    >
      {source}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export const metadata = { title: 'System Diagnostics | OM Terminal' };

export default async function SystemPage() {
  const base         = await getBaseUrl();
  const [db, opps]   = await Promise.all([
    fetchDbHealth(base),
    fetchOpportunities(base),
  ]);

  const checkedAt = new Date().toUTCString();

  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: 'Database Status',
      value: (
        <>
          <StatusBadge ok={db.status === 'ok'} label={db.database} />
          {db.message && (
            <p className="mt-1 text-xs font-mono text-red-400/80">{db.message}</p>
          )}
        </>
      ),
    },
    {
      label: 'Signals Returned',
      value: (
        <span className="font-mono text-sm font-semibold text-white tabular-nums">
          {opps ? opps.signals.length : '—'}
        </span>
      ),
    },
    {
      label: 'Market Bias',
      value: opps ? <BiasChip bias={opps.marketBias} /> : <span className="text-zinc-500 text-sm">—</span>,
    },
    {
      label: 'Data Source',
      value: opps ? <SourceChip source={opps.source} /> : <span className="text-zinc-500 text-sm">—</span>,
    },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">

      {/* Header */}
      <div className="mb-8">
        <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-zinc-500">
          Admin · Internal
        </p>
        <h1 className="mt-1 font-serif text-2xl italic text-zinc-100">
          System Diagnostics
        </h1>
        <p className="mt-1 text-xs font-mono text-zinc-500">
          Checked at {checkedAt}
        </p>
      </div>

      {/* Diagnostics table */}
      <div
        className="overflow-hidden rounded-xl"
        style={{ background: 'var(--glass)', border: '1px solid var(--border)' }}
      >
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th className="px-5 py-3 text-left text-[9px] font-mono uppercase tracking-[0.14em] text-zinc-500">
                Check
              </th>
              <th className="px-5 py-3 text-left text-[9px] font-mono uppercase tracking-[0.14em] text-zinc-500">
                Result
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.label}
                style={i < rows.length - 1 ? { borderBottom: '1px solid var(--border)' } : undefined}
              >
                <td className="px-5 py-4 text-xs font-mono text-zinc-400 whitespace-nowrap">
                  {row.label}
                </td>
                <td className="px-5 py-4">
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Environment */}
      <div
        className="mt-6 overflow-hidden rounded-xl"
        style={{ background: 'var(--glass)', border: '1px solid var(--border)' }}
      >
        <div style={{ borderBottom: '1px solid var(--border)' }} className="px-5 py-3">
          <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-zinc-500">
            Environment
          </span>
        </div>
        <table className="w-full">
          <tbody>
            {(
              [
                ['NODE_ENV',      process.env.NODE_ENV        ?? '—'],
                ['DATABASE_URL',  process.env.DATABASE_URL    ? '✓ set' : '✗ missing'],
                ['CRON_SECRET',   process.env.CRON_SECRET     ? '✓ set' : '✗ missing'],
                ['ADMIN_SECRET',  process.env.ADMIN_SECRET    ? '✓ set' : '✗ missing'],
                ['GNEWS_API_KEY', process.env.GNEWS_API_KEY   ? '✓ set' : '✗ missing'],
              ] as [string, string][]
            ).map(([key, val], i, arr) => (
              <tr
                key={key}
                style={i < arr.length - 1 ? { borderBottom: '1px solid var(--border)' } : undefined}
              >
                <td className="px-5 py-3 text-xs font-mono text-zinc-400 whitespace-nowrap">
                  {key}
                </td>
                <td className={`px-5 py-3 text-xs font-mono tabular-nums ${
                  val.startsWith('✓') ? 'text-green-400' :
                  val.startsWith('✗') ? 'text-red-400'   : 'text-zinc-300'
                }`}>
                  {val}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-[10px] font-mono text-zinc-600">
        This page is not indexed and should not be exposed publicly in production.
      </p>
    </div>
  );
}
