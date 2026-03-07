/**
 * Model Tracker — Intelligence service for AI model releases.
 *
 * Tracks: model launches, benchmark results, capability shifts, deprecations.
 * Future: automated ingestion from arxiv, model cards, and company blogs.
 */

import { fetchModels, type AIModel } from '@/lib/dataService';

export interface ModelEvent {
  modelId: string;
  type: 'release' | 'benchmark' | 'deprecation' | 'update';
  date: string;
  description: string;
}

export async function getLatestModels(): Promise<AIModel[]> {
  return fetchModels();
}

export async function getModelsByType(type: AIModel['type']): Promise<AIModel[]> {
  const models = await fetchModels();
  return models.filter(m => m.type === type);
}

/** Placeholder for future: track model events from external sources */
export async function getModelEvents(): Promise<ModelEvent[]> {
  // Future: query model_events table or external APIs
  return [];
}
