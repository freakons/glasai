import { fetchRegulations } from '@/services/data';
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
        subtitle={`${regulations.length} regulatory actions · EU · US · China · India — updated March 2026`}
        gradient="var(--rose-l), var(--amber-l)"
      />

      <RegulationFilters />

      <div className="gov-grid">
        {regulations.map((reg) => (
          <RegulationCard key={reg.id} regulation={reg} />
        ))}
      </div>
    </>
  );
}
