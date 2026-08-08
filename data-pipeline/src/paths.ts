// Centralized filesystem paths for the pipeline.
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// data-pipeline/
export const PIPELINE_ROOT = resolve(__dirname, '..');
// laadpalenviewer/
export const PROJECT_ROOT = resolve(PIPELINE_ROOT, '..');

export const CACHE_DIR = join(PIPELINE_ROOT, '.cache');
export const PIPELINE_DATA_DIR = join(PIPELINE_ROOT, 'data');

// webapp output targets
export const WEBAPP_PUBLIC = join(PROJECT_ROOT, 'webapp', 'public');
export const DATA_DIR = join(WEBAPP_PUBLIC, 'data');
export const GEMEENTEN_DIR = join(DATA_DIR, 'gemeenten');
export const SNAPSHOTS_DIR = join(DATA_DIR, 'snapshots');
export const STATUS_DIR = join(DATA_DIR, 'status');
export const MUNICIPALITIES_JSON = join(WEBAPP_PUBLIC, 'municipalities.json');
