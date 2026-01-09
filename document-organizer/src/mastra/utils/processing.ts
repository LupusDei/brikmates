import { classifyDocument } from '../agents/classifier.js';
import { extractKeys } from '../agents/extractor.js';
import { DocumentCache } from './cache.js';
import type { ProcessedDocument } from './types.js';

/**
 * Process a single document: classify and extract keys in parallel
 * Uses cache to avoid reprocessing documents with the same content
 */
export async function processDocument(
  id: string,
  filename: string,
  content: string,
  cache?: DocumentCache
): Promise<{ doc: ProcessedDocument; fromCache: boolean }> {
  // Check cache first
  if (cache) {
    const cached = cache.get(content);
    if (cached) {
      return {
        doc: {
          id,
          filename,
          classification: cached.classification,
          extraction: cached.extraction,
          content,
        },
        fromCache: true,
      };
    }
  }

  // Run classification and extraction in parallel
  const [classification, extraction] = await Promise.all([
    classifyDocument(content),
    extractKeys(content),
  ]);

  // Save to cache
  if (cache) {
    cache.set(content, classification, extraction);
  }

  return {
    doc: {
      id,
      filename,
      classification,
      extraction,
      content,
    },
    fromCache: false,
  };
}
