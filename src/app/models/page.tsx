import { fetchModels } from '@/services/data';
import { PageHeader } from '@/components/ui/PageHeader';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Models',
  description: 'Track every major AI model release — benchmarks, capabilities, and competitive analysis.',
};

export const revalidate = 300;

export default async function ModelsPage() {
  const models = await fetchModels();

  return (
    <>
      <PageHeader
        title="AI"
        highlight="Models"
        subtitle={`${models.length} models tracked · benchmarks · capabilities · releases`}
        gradient="var(--indigo-l), var(--cyan-l)"
      />

      <div className="news-grid">
        {models.map((model) => (
          <div key={model.id} className="nc" style={{ cursor: 'default' }}>
            <div className="nc-top">
              <span className="badge models">{model.type}</span>
              <span style={{ fontFamily: 'var(--fm)', fontSize: '9.5px', color: 'var(--text3)' }}>
                {model.contextWindow} ctx
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 20 }}>{model.icon}</span>
              <div className="nc-title" style={{ marginBottom: 0 }}>{model.name}</div>
            </div>
            <div style={{ fontFamily: 'var(--fm)', fontSize: '9.5px', color: 'var(--text3)', marginBottom: 8, letterSpacing: '0.04em' }}>
              {model.company} &middot; {model.releaseDate}
            </div>
            <div className="nc-body">{model.summary}</div>
            <div className="nc-foot">
              <span style={{ color: 'var(--indigo-l)' }}>{model.keyCapability}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
