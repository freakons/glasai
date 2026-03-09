export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { runHarvester } from '@/harvester/runner';
import { runTrendAnalysis } from '@/trends/runner';
import { runInsightGeneration } from '@/insights/runner';

export async function POST() {
  await runHarvester();
  await runTrendAnalysis();
  await runInsightGeneration();

  return NextResponse.json({ status: 'cycle complete' });
}
