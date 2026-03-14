interface PageHeaderProps {
  title: string;
  highlight: string;
  subtitle: string;
  gradient?: string;
}

export function PageHeader({ title, highlight, subtitle, gradient = 'var(--indigo-l), var(--cyan-l)' }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div className="page-header-top">
        <div className="page-header-titles">
          <h1 className="page-header-title">
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
          <p className="page-header-subtitle">{subtitle}</p>
        </div>
      </div>
      <div className="page-header-divider" />
    </div>
  );
}
