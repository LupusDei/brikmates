import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { GroupingResult, GroupedOutput, LeaseFile, ProcessedDocument } from '../workflows/groupDocuments.js';

// Default file for persisted grouping results
const DEFAULT_GROUPING_FILE = '.document-grouping.json';

/**
 * Summary of a lease with its related documents
 */
export interface LeaseSummary {
  lessor: string;
  address: string;
  baseLease: string | null;
  amendmentCount: number;
  commencementCount: number;
  deliveryCount: number;
  otherCount: number;
  totalDocuments: number;
}

/**
 * Detailed lease information including all related documents
 */
export interface LeaseDetails {
  lessor: string;
  address: string;
  leaseFile: LeaseFile;
  documents: ProcessedDocument[];
}

/**
 * Save grouping result to disk for later querying
 */
export function saveGroupingResult(
  result: GroupingResult,
  filePath: string = DEFAULT_GROUPING_FILE
): void {
  writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf-8');
}

/**
 * Load grouping result from disk
 */
export function loadGroupingResult(
  filePath: string = DEFAULT_GROUPING_FILE
): GroupingResult | null {
  try {
    if (existsSync(filePath)) {
      const data = readFileSync(filePath, 'utf-8');
      return JSON.parse(data) as GroupingResult;
    }
  } catch (error) {
    console.warn('Failed to load grouping result:', error);
  }
  return null;
}

/**
 * Lease Query API for exploring cached document organization
 */
export class LeaseQuery {
  private result: GroupingResult;
  private filePath: string;

  constructor(filePath: string = DEFAULT_GROUPING_FILE) {
    this.filePath = filePath;
    const loaded = loadGroupingResult(filePath);
    if (!loaded) {
      throw new Error(
        `No grouping data found at ${filePath}. Run organizeDocuments() first.`
      );
    }
    this.result = loaded;
  }

  /**
   * Get all lease files as summaries
   */
  getAllLeases(): LeaseSummary[] {
    const leases: LeaseSummary[] = [];

    for (const [lessor, addresses] of Object.entries(this.result.grouped)) {
      for (const [address, data] of Object.entries(addresses)) {
        leases.push({
          lessor,
          address,
          baseLease: data.leaseFile.baseLease,
          amendmentCount: data.leaseFile.amendments.length,
          commencementCount: data.leaseFile.commencements.length,
          deliveryCount: data.leaseFile.deliveries.length,
          otherCount: data.leaseFile.others.length,
          totalDocuments: data.documents.length,
        });
      }
    }

    return leases;
  }

  /**
   * Get all unique lessors
   */
  getLessors(): string[] {
    return Object.keys(this.result.grouped);
  }

  /**
   * Get all addresses for a specific lessor
   */
  getAddresses(lessor: string): string[] {
    const lessorData = this.result.grouped[lessor];
    return lessorData ? Object.keys(lessorData) : [];
  }

  /**
   * Get detailed lease information for a specific lessor and address
   */
  getLeaseDetails(lessor: string, address: string): LeaseDetails | null {
    const lessorData = this.result.grouped[lessor];
    if (!lessorData) return null;

    const addressData = lessorData[address];
    if (!addressData) return null;

    return {
      lessor,
      address,
      leaseFile: addressData.leaseFile,
      documents: addressData.documents,
    };
  }

  /**
   * Get all amendments for a specific lease
   */
  getAmendments(lessor: string, address: string): ProcessedDocument[] {
    const details = this.getLeaseDetails(lessor, address);
    if (!details) return [];

    const amendmentIds = new Set(details.leaseFile.amendments);
    return details.documents.filter((doc) => amendmentIds.has(doc.id));
  }

  /**
   * Get all rent commencements for a specific lease
   */
  getCommencements(lessor: string, address: string): ProcessedDocument[] {
    const details = this.getLeaseDetails(lessor, address);
    if (!details) return [];

    const commencementIds = new Set(details.leaseFile.commencements);
    return details.documents.filter((doc) => commencementIds.has(doc.id));
  }

  /**
   * Get all delivery letters for a specific lease
   */
  getDeliveries(lessor: string, address: string): ProcessedDocument[] {
    const details = this.getLeaseDetails(lessor, address);
    if (!details) return [];

    const deliveryIds = new Set(details.leaseFile.deliveries);
    return details.documents.filter((doc) => deliveryIds.has(doc.id));
  }

  /**
   * Get the base lease document for a specific address
   */
  getBaseLease(lessor: string, address: string): ProcessedDocument | null {
    const details = this.getLeaseDetails(lessor, address);
    if (!details || !details.leaseFile.baseLease) return null;

    return (
      details.documents.find((doc) => doc.id === details.leaseFile.baseLease) ||
      null
    );
  }

  /**
   * Get all related documents for a lease (grouped by type)
   */
  getRelatedDocuments(
    lessor: string,
    address: string
  ): {
    baseLease: ProcessedDocument | null;
    amendments: ProcessedDocument[];
    commencements: ProcessedDocument[];
    deliveries: ProcessedDocument[];
    others: ProcessedDocument[];
  } | null {
    const details = this.getLeaseDetails(lessor, address);
    if (!details) return null;

    const { leaseFile, documents } = details;
    const docMap = new Map(documents.map((d) => [d.id, d]));

    return {
      baseLease: leaseFile.baseLease ? docMap.get(leaseFile.baseLease) || null : null,
      amendments: leaseFile.amendments.map((id) => docMap.get(id)!).filter(Boolean),
      commencements: leaseFile.commencements.map((id) => docMap.get(id)!).filter(Boolean),
      deliveries: leaseFile.deliveries.map((id) => docMap.get(id)!).filter(Boolean),
      others: leaseFile.others.map((id) => docMap.get(id)!).filter(Boolean),
    };
  }

  /**
   * Search leases by lessor name (partial match, case-insensitive)
   */
  searchByLessor(query: string): LeaseSummary[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllLeases().filter((lease) =>
      lease.lessor.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Search leases by address (partial match, case-insensitive)
   */
  searchByAddress(query: string): LeaseSummary[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllLeases().filter((lease) =>
      lease.address.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get ungrouped documents (those with unknown lessor or address)
   */
  getUngroupedDocuments(): ProcessedDocument[] {
    return this.result.ungrouped;
  }

  /**
   * Get overall statistics
   */
  getStats(): GroupingResult['stats'] {
    return this.result.stats;
  }

  /**
   * Find a document by ID across all leases
   */
  findDocumentById(documentId: string): {
    document: ProcessedDocument;
    lessor: string;
    address: string;
  } | null {
    // Check grouped documents
    for (const [lessor, addresses] of Object.entries(this.result.grouped)) {
      for (const [address, data] of Object.entries(addresses)) {
        const doc = data.documents.find((d) => d.id === documentId);
        if (doc) {
          return { document: doc, lessor, address };
        }
      }
    }

    // Check ungrouped documents
    const ungroupedDoc = this.result.ungrouped.find((d) => d.id === documentId);
    if (ungroupedDoc) {
      return { document: ungroupedDoc, lessor: 'unknown', address: 'unknown' };
    }

    return null;
  }

  /**
   * Reload data from disk
   */
  reload(): void {
    const loaded = loadGroupingResult(this.filePath);
    if (!loaded) {
      throw new Error(`No grouping data found at ${this.filePath}`);
    }
    this.result = loaded;
  }
}
