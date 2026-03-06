interface PageHeaderProps {
  title: string;
  highlight: string;
  subtitle: string;
  gradient?: string;
}

export function PageHeader({ title, highlight, subtitle, gradient = 'var(--indigo-l), var(--cyan-l)' }: PageHeaderProps) {
  return (
    <div className="ph">
      <div className="ph-left">
        <h1>
          {title}{' '}
          <span style={{
            fontStyle: 'italic',
            background: `linear-gradient(90deg, ${gradient})`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            {highlight}
          </span>
        </h1>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}
