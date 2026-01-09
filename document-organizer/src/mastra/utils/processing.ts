import { classifyDocument } from '../agents/classifier.js';
import { extractKeys } from '../agents/extractor.js';
import { DocumentCache } from './cache.js';
import {
  processDocumentChunked,
  needsChunking,
  type ChunkConfig,
  type ChunkingInfo,
} from './chunkedProcessor.js';
import type { ProcessedDocument } from './types.js';

/**
 * Result of document processing including chunking metadata
 */
export interface ProcessDocumentResult {
  doc: ProcessedDocument;
  fromCache: boolean;
  chunkingInfo?: ChunkingInfo;
}

/**
 * Process a single document: classify and extract keys
 * Uses chunked processing for large documents and cache to avoid reprocessing
 */
export async function processDocument(
  id: string,
  filename: string,
  content: string,
  cache?: DocumentCache,
  chunkConfig?: Partial<ChunkConfig>
): Promise<ProcessDocumentResult> {
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

  let classification;
  let extraction;
  let chunkingInfo: ChunkingInfo | undefined;

  // Check if document needs chunked processing
  if (needsChunking(content)) {
    // Use chunked processing for large documents
    const result = await processDocumentChunked(content, chunkConfig ? { ...chunkConfig } as ChunkConfig : undefined);
    classification = result.classification;
    extraction = result.extraction;
    chunkingInfo = result.chunkingInfo;
  } else {
    // Run classification and extraction in parallel for small documents
    [classification, extraction] = await Promise.all([
      classifyDocument(content),
      extractKeys(content),
    ]);
  }

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
    chunkingInfo,
  };
}
