import { classifyDocument, type ClassificationResult } from '../agents/classifier.js';
import { extractKeys, type ExtractionResult } from '../agents/extractor.js';

// Re-export ExtractionResult for consumers
export type { ExtractionResult } from '../agents/extractor.js';

/**
 * Configuration for chunked document processing
 */
export interface ChunkConfig {
  /** Maximum size in characters for a single chunk (default: 50000 ~= 12.5k tokens) */
  maxChunkSize: number;
  /** Size threshold above which chunking is enabled (default: 100000 chars) */
  sizeThreshold: number;
  /** Overlap between chunks to preserve context (default: 500 chars) */
  overlapSize: number;
  /** Maximum number of chunks to process for extraction (default: 5) */
  maxExtractionChunks: number;
}

const DEFAULT_CONFIG: ChunkConfig = {
  maxChunkSize: 50000,      // ~12.5k tokens, well under Claude's context
  sizeThreshold: 100000,    // 100KB - documents larger than this get chunked
  overlapSize: 500,         // Small overlap to maintain context
  maxExtractionChunks: 5,   // Process up to 5 chunks for extraction
};

/**
 * Information about how a document was processed
 */
export interface ChunkingInfo {
  wasChunked: boolean;
  totalChunks: number;
  chunksProcessed: number;
  originalSize: number;
}

/**
 * Result of chunked processing
 */
export interface ChunkedProcessingResult {
  classification: ClassificationResult;
  extraction: ExtractionResult;
  chunkingInfo: ChunkingInfo;
}

/**
 * Determines if a document needs chunked processing
 */
export function needsChunking(content: string, config: ChunkConfig = DEFAULT_CONFIG): boolean {
  return content.length > config.sizeThreshold;
}

/**
 * Splits document content into overlapping chunks
 */
export function splitIntoChunks(content: string, config: ChunkConfig = DEFAULT_CONFIG): string[] {
  const { maxChunkSize, overlapSize } = config;

  // If content fits in a single chunk, return it as-is
  if (content.length <= maxChunkSize) {
    return [content];
  }

  const chunks: string[] = [];
  let position = 0;

  while (position < content.length) {
    // Calculate end position for this chunk
    let endPosition = Math.min(position + maxChunkSize, content.length);

    // Only look for break points if we're not at the end
    if (endPosition < content.length) {
      // Search the last 20% of the chunk for natural break points
      const searchLength = Math.min(200, Math.floor(maxChunkSize * 0.2));
      const searchStart = Math.max(endPosition - searchLength, position);
      const searchRegion = content.slice(searchStart, endPosition);

      // Look for paragraph break first
      const paragraphBreak = searchRegion.lastIndexOf('\n\n');
      if (paragraphBreak !== -1) {
        endPosition = searchStart + paragraphBreak + 2;
      } else {
        // Look for sentence end
        const sentenceEnd = searchRegion.lastIndexOf('. ');
        if (sentenceEnd !== -1) {
          endPosition = searchStart + sentenceEnd + 2;
        } else {
          // Fall back to newline
          const newlineBreak = searchRegion.lastIndexOf('\n');
          if (newlineBreak !== -1) {
            endPosition = searchStart + newlineBreak + 1;
          }
          // Otherwise keep original endPosition
        }
      }
    }

    chunks.push(content.slice(position, endPosition));

    // If we've reached the end, stop
    if (endPosition >= content.length) {
      break;
    }

    // Move position, accounting for overlap (but ensure progress)
    const nextPosition = endPosition - overlapSize;
    position = nextPosition > position ? nextPosition : endPosition;
  }

  return chunks;
}

/**
 * Merges extraction results from multiple chunks, preferring non-"unknown" values
 */
export function mergeExtractionResults(results: ExtractionResult[]): ExtractionResult {
  const merged: ExtractionResult = {
    lessor: 'unknown',
    address: 'unknown',
    tenant: 'unknown',
    baseReference: undefined,
  };

  for (const result of results) {
    // Take first non-unknown value for each field
    if (merged.lessor === 'unknown' && result.lessor && result.lessor !== 'unknown') {
      merged.lessor = result.lessor;
    }
    if (merged.address === 'unknown' && result.address && result.address !== 'unknown') {
      merged.address = result.address;
    }
    if (merged.tenant === 'unknown' && result.tenant && result.tenant !== 'unknown') {
      merged.tenant = result.tenant;
    }
    if (!merged.baseReference && result.baseReference) {
      merged.baseReference = result.baseReference;
    }

    // If all fields are filled, we're done
    if (
      merged.lessor !== 'unknown' &&
      merged.address !== 'unknown' &&
      merged.tenant !== 'unknown'
    ) {
      break;
    }
  }

  return merged;
}

/**
 * Process a document using chunking if needed
 *
 * Strategy:
 * - Classification: Use first chunk only (document type is usually clear from beginning)
 * - Extraction: Process multiple chunks and merge results to find all key fields
 */
export async function processDocumentChunked(
  content: string,
  config: ChunkConfig = DEFAULT_CONFIG
): Promise<ChunkedProcessingResult> {
  const originalSize = content.length;

  // If document is small enough, process normally
  if (!needsChunking(content, config)) {
    const [classification, extraction] = await Promise.all([
      classifyDocument(content),
      extractKeys(content),
    ]);

    return {
      classification,
      extraction,
      chunkingInfo: {
        wasChunked: false,
        totalChunks: 1,
        chunksProcessed: 1,
        originalSize,
      },
    };
  }

  // Split into chunks
  const chunks = splitIntoChunks(content, config);
  const totalChunks = chunks.length;

  console.log(`  Large document detected (${(originalSize / 1024).toFixed(1)}KB), splitting into ${totalChunks} chunks`);

  // Classification: Use first chunk only
  // Most lease documents have their type evident from the title/header
  const classificationChunk = chunks[0];
  const classification = await classifyDocument(classificationChunk);

  console.log(`  Classification from chunk 1: ${classification.documentType}`);

  // Extraction: Process chunks until we have all required fields or hit limit
  const extractionResults: ExtractionResult[] = [];
  const chunksToProcess = Math.min(chunks.length, config.maxExtractionChunks);

  for (let i = 0; i < chunksToProcess; i++) {
    console.log(`  Extracting from chunk ${i + 1}/${chunksToProcess}...`);
    const extraction = await extractKeys(chunks[i]);
    extractionResults.push(extraction);

    // Check if we have all required fields
    const merged = mergeExtractionResults(extractionResults);
    if (
      merged.lessor !== 'unknown' &&
      merged.address !== 'unknown' &&
      merged.tenant !== 'unknown'
    ) {
      console.log(`  All key fields found after ${i + 1} chunks`);
      break;
    }
  }

  const extraction = mergeExtractionResults(extractionResults);

  return {
    classification,
    extraction,
    chunkingInfo: {
      wasChunked: true,
      totalChunks,
      chunksProcessed: extractionResults.length,
      originalSize,
    },
  };
}

/**
 * Get chunking configuration with optional overrides
 */
export function getChunkConfig(overrides?: Partial<ChunkConfig>): ChunkConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}
