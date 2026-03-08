export type GraphNode = {
  id: string;
  type: "entity" | "event" | "signal";
  label: string;
};

export type GraphLink = {
  source: string;
  target: string;
};

export type GraphData = {
  nodes: GraphNode[];
  links: GraphLink[];
};

export const mockGraphData: GraphData = {
  nodes: [
    // Entities
    { id: "openai",   type: "entity", label: "OpenAI" },
    { id: "anthropic", type: "entity", label: "Anthropic" },
    { id: "deepmind", type: "entity", label: "Google DeepMind" },
    { id: "nvidia",   type: "entity", label: "NVIDIA" },

    // Events
    { id: "gpt5",       type: "event", label: "GPT-5 Release" },
    { id: "anthfunding", type: "event", label: "Anthropic Funding" },
    { id: "gemini",     type: "event", label: "Gemini Benchmark" },

    // Signals
    { id: "frontier",  type: "signal", label: "Frontier AI competition accelerating" },
    { id: "modelwave", type: "signal", label: "Model release wave" },
  ],
  links: [
    { source: "openai",    target: "gpt5" },
    { source: "anthropic", target: "anthfunding" },
    { source: "deepmind",  target: "gemini" },
    { source: "gpt5",      target: "frontier" },
    { source: "gpt5",      target: "modelwave" },
    { source: "anthfunding", target: "frontier" },
    { source: "gemini",    target: "modelwave" },
    { source: "nvidia",    target: "frontier" },
    { source: "openai",    target: "frontier" },
    { source: "anthropic", target: "modelwave" },
  ],
};
