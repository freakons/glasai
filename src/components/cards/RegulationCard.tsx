import type { Regulation } from '@/lib/data/regulations';

interface RegulationCardProps {
  regulation: Regulation;
}

const TYPE_GRADIENT: Record<string, string> = {
  law: 'linear-gradient(180deg, var(--rose), var(--amber))',
  bill: 'linear-gradient(180deg, var(--amber), var(--emerald))',
  exec: 'linear-gradient(180deg, var(--violet), var(--indigo))',
  policy: 'linear-gradient(180deg, var(--sky), var(--cyan))',
  report: 'linear-gradient(180deg, var(--emerald), var(--cyan))',
};

export function RegulationCard({ regulation }: RegulationCardProps) {
  return (
    <div className="gov-card" style={{ '--gc': TYPE_GRADIENT[regulation.type] } as React.CSSProperties}>
      <div className="gov-top">
        <span className={`gov-badge ${regulation.type}`}>{regulation.type}</span>
        <span className="gov-country">{regulation.flag} {regulation.country}</span>
      </div>
      <div className="gov-title">{regulation.title}</div>
      <div className="gov-sum">{regulation.summary}</div>
      <div className="gov-foot">
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span className={`sdot ${regulation.status}`} />
          {regulation.status.charAt(0).toUpperCase() + regulation.status.slice(1)}
        </span>
        <span>{regulation.date}</span>
      </div>
    </div>
  );
}
