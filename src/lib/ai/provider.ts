export interface AIProvider {
  generate(prompt: string): Promise<string>;
  classify(text: string): Promise<string>;
  summarize(text: string): Promise<string>;
  embed(text: string): Promise<number[]>;
}
