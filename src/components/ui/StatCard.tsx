interface StatCardProps {
  value: string;
  label: string;
  delta?: string;
  color?: string;
  glowColor?: string;
}

export function StatCard({ value, label, delta, color, glowColor }: StatCardProps) {
  return (
    <div
      className="stat"
      style={{
        '--sc': glowColor || 'rgba(79,70,229,0.4)',
        '--sv': color || 'var(--indigo-l)',
      } as React.CSSProperties}
    >
      <div className="stat-n">{value}</div>
      <div className="stat-l">{label}</div>
      {delta && <div className="stat-d">{delta}</div>}
    </div>
  );
}
