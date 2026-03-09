export interface RawSignal {
  id?: string;
  title: string;
  content: string;
  url?: string;
  source: string;
  published_at?: string;
}

export interface NormalizedSignal {
  title: string;
  description: string;
  source: string;
  url?: string;
  published_at?: string;
  ai_model?: string;
}
