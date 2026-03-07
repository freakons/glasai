/**
 * Regulation Tracker — Intelligence service for AI regulation and policy.
 *
 * Tracks: AI laws, executive orders, policy proposals, enforcement actions.
 * Future: automated monitoring of government gazette feeds and legislative databases.
 */

import { fetchRegulations, type Regulation } from '@/lib/dataService';

export interface RegulatoryAlert {
  regulationId: string;
  type: 'new' | 'update' | 'enforcement' | 'deadline';
  severity: 'critical' | 'high' | 'medium' | 'low';
  date: string;
  description: string;
}

export async function getActiveRegulations(): Promise<Regulation[]> {
  const regulations = await fetchRegulations();
  return regulations.filter(r => r.status === 'active');
}

export async function getPendingRegulations(): Promise<Regulation[]> {
  const regulations = await fetchRegulations();
  return regulations.filter(r => r.status === 'pending');
}

export async function getRegulationsByCountry(country: string): Promise<Regulation[]> {
  const regulations = await fetchRegulations();
  return regulations.filter(r => r.country.toLowerCase().includes(country.toLowerCase()));
}

/** Placeholder for future: regulatory alert engine */
export async function getRegulatoryAlerts(): Promise<RegulatoryAlert[]> {
  // Future: query regulatory_alerts table or monitor government feeds
  return [];
}
