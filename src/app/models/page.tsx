import { fetchModels } from '@/lib/dataService';
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
        subtitle={models.length > 0 ? `${models.length} models tracked` : 'Tracking AI model releases'}
        gradient="var(--indigo-l), var(--cyan-l)"
      />

      {models.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 24px' }}>
          <p style={{ fontFamily: 'var(--fs)', fontStyle: 'italic', fontSize: 18, color: 'var(--text2)', marginBottom: 8 }}>
            No model data yet
          </p>
          <p style={{ fontFamily: 'var(--fm)', fontSize: 11, color: 'var(--text3)', letterSpacing: '0.04em' }}>
            AI model intelligence will appear here once the pipeline ingests data.
          </p>
        </div>
      ) : (
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
      )}
    </>
  );
}
