import Link from 'next/link';
import type { AIModel } from '@/lib/data/models';

const TYPE_COLOR: Record<string, { color: string; border: string; bg: string }> = {
  proprietary: { color: 'var(--indigo-l)', border: 'rgba(79,70,229,0.3)', bg: 'rgba(79,70,229,0.1)' },
  'open-weight': { color: 'var(--amber-l)', border: 'rgba(217,119,6,0.3)', bg: 'rgba(217,119,6,0.1)' },
  'open-source': { color: 'var(--emerald-l)', border: 'rgba(5,150,105,0.3)', bg: 'rgba(5,150,105,0.1)' },
};

export function ModelCard({ model }: { model: AIModel }) {
  const tc = TYPE_COLOR[model.type] || TYPE_COLOR.proprietary;

  return (
    <Link href={`/models/${model.id}`} style={{ textDecoration: 'none' }}>
      <div className="gc" style={{ padding: 20, cursor: 'pointer', transition: 'all 0.22s var(--ease)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'var(--glass2)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
          }}>{model.icon}</div>
          <div>
            <div style={{ fontFamily: 'var(--fd)', fontSize: 16, fontStyle: 'italic', color: 'var(--text)' }}>{model.name}</div>
            <div style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text3)' }}>{model.company}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <span style={{
            fontFamily: 'var(--fm)', fontSize: 8.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const,
            padding: '2px 8px', borderRadius: 20, color: tc.color, borderColor: tc.border, background: tc.bg, border: `1px solid ${tc.border}`,
          }}>{model.type}</span>
          <span style={{
            fontFamily: 'var(--fm)', fontSize: 8.5, padding: '2px 8px', borderRadius: 20,
            background: 'var(--glass)', border: '1px solid var(--border)', color: 'var(--text3)',
          }}>{model.contextWindow}</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>{model.summary}</p>
        <div style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text3)', marginTop: 10 }}>{model.releaseDate}</div>
      </div>
    </Link>
  );
}
