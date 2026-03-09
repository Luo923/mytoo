import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 固定相对于本文件的路径，不依赖 process.cwd()，避免因启动目录不同导致路径错误
const dataRoot = path.resolve(fileURLToPath(import.meta.url), '../../../../../data');

type CacheEnvelope<T> = {
  updatedAt: string;
  payload: T;
};

const ensureDir = async (filePath: string) => {
  await mkdir(path.dirname(filePath), { recursive: true });
};

/** 手动标记缓存过期的键集合 */
const expiredKeys = new Set<string>();

/** 同步标记缓存为过期 */
export const deleteCache = (cacheKey: string): void => {
  expiredKeys.add(cacheKey);
};

/** 检查缓存是否被手动标记为过期（检查后自动清除标记） */
const isCacheExpired = (cacheKey: string): boolean => {
  if (expiredKeys.has(cacheKey)) {
    expiredKeys.delete(cacheKey);
    return true;
  }
  return false;
};

export const readCache = async <T>(cacheKey: string, maxAgeMs: number): Promise<T | null> => {
  if (isCacheExpired(cacheKey)) return null;
  const filePath = path.join(dataRoot, `${cacheKey}.json`);
  try {
    const raw = await readFile(filePath, 'utf8');
    const envelope = JSON.parse(raw) as CacheEnvelope<T>;
    const updatedAt = new Date(envelope.updatedAt).getTime();
    if (Number.isNaN(updatedAt)) {
      return null;
    }
    if (Date.now() - updatedAt > maxAgeMs) {
      return null;
    }
    return envelope.payload;
  } catch {
    return null;
  }
};

export const writeCache = async <T>(cacheKey: string, payload: T): Promise<void> => {
  const filePath = path.join(dataRoot, `${cacheKey}.json`);
  await ensureDir(filePath);
  const envelope: CacheEnvelope<T> = {
    updatedAt: new Date().toISOString(),
    payload
  };
  await writeFile(filePath, JSON.stringify(envelope, null, 2), 'utf8');
};

export const getDataRoot = (): string => dataRoot;
