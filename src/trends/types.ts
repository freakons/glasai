export interface TrendSignal {
  title: string;
  category: string;
  source: string;
  entities: { type: string; name: string }[];
  published_at?: string;
}

export interface TrendResult {
  topic: string;
  category: string;
  signal_count: number;
  score: number;
  entities: string[];
  summary: string;
  confidence: number;
}
