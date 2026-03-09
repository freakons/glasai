import { RawSignal } from '../types';

export interface SourceAdapter {
  name: string;
  fetchSignals(): Promise<RawSignal[]>;
}
