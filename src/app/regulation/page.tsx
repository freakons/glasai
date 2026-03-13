import { fetchRegulations } from '@/lib/dataService';
import { PageHeader } from '@/components/ui/PageHeader';
import { RegulationCard } from '@/components/cards/RegulationCard';
import { RegulationFilters } from './filters';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Regulation & Policy',
  description: 'Track global AI regulation — EU AI Act, US executive orders, China CAC rules, and more.',
};

export const revalidate = 300;

export default async function RegulationPage() {
  const regulations = await fetchRegulations();

  return (
    <>
      <PageHeader
        title="Regulation &"
        highlight="Policy"
        subtitle={regulations.length > 0 ? `${regulations.length} regulatory actions tracked` : 'Tracking global AI regulation'}
        gradient="var(--rose-l), var(--amber-l)"
      />

      <RegulationFilters />

      {regulations.length === 0 ? (
        <div className="empty-state" style={{ textAlign: 'center', padding: '64px 24px' }}>
          <p style={{ fontFamily: 'var(--fs)', fontStyle: 'italic', fontSize: 18, color: 'var(--text2)', marginBottom: 8 }}>
            No regulatory data yet
          </p>
          <p style={{ fontFamily: 'var(--fm)', fontSize: 11, color: 'var(--text3)', letterSpacing: '0.04em' }}>
            Regulation intelligence will appear here once the pipeline ingests data.
          </p>
        </div>
      ) : (
        <div className="gov-grid">
          {regulations.map((reg) => (
            <RegulationCard key={reg.id} regulation={reg} />
          ))}
        </div>
      )}
    </>
  );
}
