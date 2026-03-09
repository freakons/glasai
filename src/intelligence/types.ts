export type SignalCategory =
  | 'ai_startup'
  | 'ai_model_release'
  | 'funding'
  | 'tool_launch'
  | 'research'
  | 'other';

export interface ExtractedEntity {
  type: string;
  name: string;
}

export interface IntelligenceResult {
  category: SignalCategory;
  entities: ExtractedEntity[];
  summary: string;
  confidence: number;
}
