import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { ClassificationResult } from '../agents/classifier.js';
import type { ExtractionResult } from '../agents/extractor.js';

// Cache file location (relative to working directory)
const DEFAULT_CACHE_FILE = '.document-cache.json';

// Cached result for a processed document
export interface CachedDocumentResult {
  classification: ClassificationResult;
  extraction: ExtractionResult;
  timestamp: number;
}

// Cache structure: content hash -> cached result
interface CacheData {
  version: number;
  entries: Record<string, CachedDocumentResult>;
}

const CACHE_VERSION = 1;

/**
 * Generate a SHA-256 hash of document content
 */
export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Load cache from disk
 */
export function loadCache(cacheFile: string = DEFAULT_CACHE_FILE): CacheData {
  try {
    if (existsSync(cacheFile)) {
      const data = readFileSync(cacheFile, 'utf-8');
      const cache = JSON.parse(data) as CacheData;

      // Check version compatibility
      if (cache.version !== CACHE_VERSION) {
        console.log('Cache version mismatch, starting fresh');
        return { version: CACHE_VERSION, entries: {} };
      }

      return cache;
    }
  } catch (error) {
    console.warn('Failed to load cache, starting fresh:', error);
  }

  return { version: CACHE_VERSION, entries: {} };
}

/**
 * Save cache to disk
 */
export function saveCache(cache: CacheData, cacheFile: string = DEFAULT_CACHE_FILE): void {
  try {
    writeFileSync(cacheFile, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (error) {
    console.warn('Failed to save cache:', error);
  }
}

/**
 * Get cached result for document content
 */
export function getCachedResult(
  content: string,
  cache: CacheData
): CachedDocumentResult | null {
  const hash = hashContent(content);
  return cache.entries[hash] || null;
}

/**
 * Set cached result for document content
 */
export function setCachedResult(
  content: string,
  result: CachedDocumentResult,
  cache: CacheData
): void {
  const hash = hashContent(content);
  cache.entries[hash] = result;
}

/**
 * Document cache manager for convenient usage
 */
export class DocumentCache {
  private cache: CacheData;
  private cacheFile: string;
  private dirty: boolean = false;

  constructor(cacheFile: string = DEFAULT_CACHE_FILE) {
    this.cacheFile = cacheFile;
    this.cache = loadCache(cacheFile);
  }

  /**
   * Get cached result for document content
   * Returns null if not cached
   */
  get(content: string): CachedDocumentResult | null {
    return getCachedResult(content, this.cache);
  }

  /**
   * Set cached result for document content
   */
  set(
    content: string,
    classification: ClassificationResult,
    extraction: ExtractionResult
  ): void {
    setCachedResult(
      content,
      {
        classification,
        extraction,
        timestamp: Date.now(),
      },
      this.cache
    );
    this.dirty = true;
  }

  /**
   * Save cache to disk if there are changes
   */
  save(): void {
    if (this.dirty) {
      saveCache(this.cache, this.cacheFile);
      this.dirty = false;
    }
  }

  /**
   * Get cache statistics
   */
  stats(): { entries: number; file: string } {
    return {
      entries: Object.keys(this.cache.entries).length,
      file: this.cacheFile,
    };
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache = { version: CACHE_VERSION, entries: {} };
    this.dirty = true;
  }
}
