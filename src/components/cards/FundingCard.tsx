import Link from 'next/link';
import type { FundingRound } from '@/lib/data/funding';

export function FundingCard({ round }: { round: FundingRound }) {
  return (
    <Link href={`/funding/${round.id}`} style={{ textDecoration: 'none' }}>
      <div className="gc" style={{ padding: 20, cursor: 'pointer', transition: 'all 0.22s var(--ease)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 9,
              background: 'var(--glass2)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
            }}>{round.icon}</div>
            <div>
              <div style={{ fontFamily: 'var(--fd)', fontSize: 15, fontStyle: 'italic', color: 'var(--text)' }}>{round.company}</div>
              <div style={{ fontFamily: 'var(--fm)', fontSize: 9.5, color: 'var(--text3)' }}>{round.round} · {round.date}</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' as const }}>
            <div style={{ fontFamily: 'var(--fd)', fontSize: 22, fontStyle: 'italic', fontWeight: 700, color: 'var(--amber-l)' }}>{round.amount}</div>
            <div style={{ fontFamily: 'var(--fm)', fontSize: 9, color: 'var(--text3)' }}>{round.valuation} valuation</div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 12 }}>{round.summary}</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
          {round.investors.slice(0, 3).map((inv) => (
            <span key={inv} style={{
              fontFamily: 'var(--fm)', fontSize: 9, padding: '2px 8px', borderRadius: 20,
              background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--text3)',
            }}>{inv}</span>
          ))}
        </div>
      </div>
    </Link>
  );
}
