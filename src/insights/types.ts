export interface Insight {
  title: string;
  summary: string;
  category: string;
  topics: string[];
  confidence: number;
  created_at?: string;
}
