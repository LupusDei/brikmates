import { compareTwoStrings } from 'string-similarity';
import type {
  ProcessedDocument,
  GroupedOutput,
  GroupingResult,
  SimplifiedOutput,
  LeaseFile,
} from './types.js';

// Similarity threshold for fuzzy matching (80%)
const SIMILARITY_THRESHOLD = 0.8;

/**
 * Find a matching key using fuzzy string comparison
 */
export function findFuzzyMatch(needle: string, haystack: string[]): string | null {
  for (const candidate of haystack) {
    if (compareTwoStrings(needle.toLowerCase(), candidate.toLowerCase()) >= SIMILARITY_THRESHOLD) {
      return candidate;
    }
  }
  return null;
}

/**
 * Group processed documents by lessor -> address -> leaseFile
 */
export function groupDocuments(documents: ProcessedDocument[]): GroupingResult {
  const grouped: GroupedOutput = {};
  const ungrouped: ProcessedDocument[] = [];

  for (const doc of documents) {
    const { lessor, address } = doc.extraction;

    // Skip documents with unknown lessor or address
    if (lessor === 'unknown' || address === 'unknown') {
      ungrouped.push(doc);
      continue;
    }

    // Find or create lessor group (with fuzzy matching)
    const existingLessors = Object.keys(grouped);
    const matchedLessor = findFuzzyMatch(lessor, existingLessors) || lessor;

    if (!grouped[matchedLessor]) {
      grouped[matchedLessor] = {};
    }

    // Find or create address group (with fuzzy matching)
    const existingAddresses = Object.keys(grouped[matchedLessor]);
    const matchedAddress = findFuzzyMatch(address, existingAddresses) || address;

    if (!grouped[matchedLessor][matchedAddress]) {
      grouped[matchedLessor][matchedAddress] = {
        leaseFile: {
          baseLease: null,
          amendments: [],
          commencements: [],
          deliveries: [],
          others: [],
        },
        documents: [],
      };
    }

    const group = grouped[matchedLessor][matchedAddress];
    group.documents.push(doc);

    // Categorize document by type
    const docType = doc.classification.documentType;
    switch (docType) {
      case 'lease':
        // If there's already a base lease, keep the first one and add this to others
        if (group.leaseFile.baseLease === null) {
          group.leaseFile.baseLease = doc.id;
        } else {
          group.leaseFile.others.push(doc.id);
        }
        break;
      case 'amendment':
        group.leaseFile.amendments.push(doc.id);
        break;
      case 'rent_commencement':
        group.leaseFile.commencements.push(doc.id);
        break;
      case 'delivery_letter':
        group.leaseFile.deliveries.push(doc.id);
        break;
      default:
        group.leaseFile.others.push(doc.id);
    }
  }

  // Calculate stats
  let groupedCount = 0;
  let addressCount = 0;
  for (const lessor of Object.keys(grouped)) {
    const addresses = Object.keys(grouped[lessor]);
    addressCount += addresses.length;
    for (const address of addresses) {
      groupedCount += grouped[lessor][address].documents.length;
    }
  }

  return {
    grouped,
    ungrouped,
    stats: {
      totalDocuments: documents.length,
      groupedDocuments: groupedCount,
      ungroupedDocuments: ungrouped.length,
      lessors: Object.keys(grouped).length,
      addresses: addressCount,
    },
  };
}

/**
 * Get a simplified output structure (without full document content)
 */
export function getSimplifiedOutput(result: GroupingResult): SimplifiedOutput {
  const hierarchy: { [lessor: string]: { [address: string]: LeaseFile } } = {};

  for (const [lessor, addresses] of Object.entries(result.grouped)) {
    hierarchy[lessor] = {};
    for (const [address, data] of Object.entries(addresses)) {
      hierarchy[lessor][address] = data.leaseFile;
    }
  }

  return {
    hierarchy,
    ungrouped: result.ungrouped.map((doc) => doc.id),
    stats: result.stats,
  };
}
