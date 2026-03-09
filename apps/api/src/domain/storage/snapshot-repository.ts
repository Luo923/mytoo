import type { DashboardSnapshot } from '../types.js';
import { readCache, writeCache } from './file-cache.js';

const SNAPSHOT_CACHE_KEY = 'dashboard-live-snapshot';
const SNAPSHOT_TTL_MS = 15 * 60 * 1000;

export const loadLatestSnapshot = async (): Promise<DashboardSnapshot | null> => {
  return readCache<DashboardSnapshot>(SNAPSHOT_CACHE_KEY, SNAPSHOT_TTL_MS);
};

export const saveLatestSnapshot = async (snapshot: DashboardSnapshot): Promise<void> => {
  await writeCache(SNAPSHOT_CACHE_KEY, snapshot);
};