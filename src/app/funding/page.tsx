import { fetchFundingRounds } from '@/lib/dataService';
import { getSiteStats } from '@/db/queries';
import { parseFundingAmountUsdM, formatFundingTotal, sumFundingRounds } from '@/lib/parseFundingAmount';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Funding & Investment',
  description: 'Track AI funding rounds, valuations, and M&A activity — structured intelligence for investors.',
};

export const revalidate = 300;

const STATS_FALLBACK = {
  signals: 0, companies: 0, regulations: 0, sources: 0,
  fundingRounds: 0, models: 0, totalFundingUsdM: 0,
};

export default async function FundingPage() {
  const [rounds, live] = await Promise.all([
    fetchFundingRounds(),
    getSiteStats().catch(() => STATS_FALLBACK),
  ]);

  // Total rounds: live DB count if available, else use the data array length
  const totalRounds = live.fundingRounds > 0 ? live.fundingRounds : rounds.length;

  // Mega rounds ($1B+): count from the displayed data using the parser
  const megaRounds = rounds.filter(r => (parseFundingAmountUsdM(r.amount) ?? 0) >= 1_000).length;

  // Total funding: DB aggregate if populated (migration 004 + seeded), else inline sum
  const computedTotalM = live.totalFundingUsdM > 0
    ? live.totalFundingUsdM
    : (sumFundingRounds(rounds) ?? 0);
  const totalFundingLabel = computedTotalM > 0 ? formatFundingTotal(computedTotalM) : 'N/A';

  return (
    <>
      <PageHeader
        title="AI Funding &"
        highlight="Investment"
        subtitle={rounds.length > 0 ? `${rounds.length} funding rounds tracked` : 'Tracking AI funding and investment'}
        gradient="var(--amber-l), var(--emerald-l)"
      />

      {rounds.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 24px' }}>
          <p style={{ fontFamily: 'var(--fs)', fontStyle: 'italic', fontSize: 18, color: 'var(--text2)', marginBottom: 8 }}>
            No funding data yet
          </p>
          <p style={{ fontFamily: 'var(--fm)', fontSize: 11, color: 'var(--text3)', letterSpacing: '0.04em' }}>
            AI funding intelligence will appear here once the pipeline ingests data.
          </p>
        </div>
      ) : (
        <>
          <div className="stats-row">
            <StatCard value={totalFundingLabel} label="Total AI Funding" delta="Tracked rounds" color="var(--amber-l)" glowColor="rgba(217,119,6,0.4)" />
            <StatCard value={String(megaRounds || totalRounds)} label={megaRounds > 0 ? 'Mega Rounds ($1B+)' : 'Rounds Tracked'} delta="Verified" color="var(--indigo-l)" glowColor="rgba(79,70,229,0.4)" />
            <StatCard value={String(totalRounds)} label="Rounds Tracked" delta="All verified" color="var(--emerald-l)" glowColor="rgba(5,150,105,0.4)" />
          </div>

          <div className="news-grid">
            {rounds.map((round) => (
              <div key={round.id} className="nc" style={{ cursor: 'default' }}>
                <div className="nc-top">
                  <span className="badge funding">{round.round}</span>
                  <span style={{ fontFamily: 'var(--fm)', fontSize: '9.5px', color: 'var(--text3)' }}>
                    {round.date}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>{round.icon}</span>
                  <div className="nc-title" style={{ marginBottom: 0 }}>{round.company}</div>
                </div>
                <div style={{
                  display: 'flex', gap: 12, marginBottom: 12, fontFamily: 'var(--fm)', fontSize: '10px',
                  color: 'var(--text3)', letterSpacing: '0.04em',
                }}>
                  <span>Amount: <strong style={{ color: 'var(--amber-l)' }}>{round.amount}</strong></span>
                  <span>Valuation: <strong style={{ color: 'var(--text2)' }}>{round.valuation}</strong></span>
                </div>
                <div className="nc-body">{round.summary}</div>
                <div className="nc-foot">
                  <span style={{ color: 'var(--text2)' }}>
                    {round.investors.slice(0, 3).join(' · ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
