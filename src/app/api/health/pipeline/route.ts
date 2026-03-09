export const runtime = 'nodejs';
import { getPipelineHealth } from '@/lib/pipelineHealth';

export function GET() {
  return Response.json(getPipelineHealth());
}
