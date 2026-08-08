import type { NormalizedFreightLocation } from '../types.js';

// A modular external freight data source. Adding a source = implementing this
// interface and registering it in index.ts. A source that throws is skipped.
export interface FreightSource {
  id: string;
  fetch(refresh: boolean): Promise<NormalizedFreightLocation[]>;
}
