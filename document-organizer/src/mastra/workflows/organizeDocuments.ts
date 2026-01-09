import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { compareTwoStrings } from 'string-similarity';
import { classifyDocument, ClassificationResultSchema } from '../agents/classifier.js';
import { extractKeys, extractionSchema } from '../agents/extractor.js';
import { readDocsTool } from '../tools/readFiles.js';

// Similarity threshold for fuzzy matching (80%)
const SIMILARITY_THRESHOLD = 0.8;

// Schema for workflow input
const workflowInputSchema = z.object({
  folderPath: z.string().describe('Path to folder containing documents'),
});

// Schema for a processed document
const processedDocumentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  classification: ClassificationResultSchema,
  extraction: extractionSchema,
});

// Schema for lease file structure
const leaseFileSchema = z.object({
  baseLease: z.string().nullable(),
  amendments: z.array(z.string()),
  commencements: z.array(z.string()),
  deliveries: z.array(z.string()),
  others: z.array(z.string()),
});

// Schema for workflow output
const workflowOutputSchema = z.object({
  hierarchy: z.record(z.string(), z.record(z.string(), leaseFileSchema)),
  ungrouped: z.array(z.string()),
  stats: z.object({
    totalDocuments: z.number(),
    groupedDocuments: z.number(),
    ungroupedDocuments: z.number(),
    lessors: z.number(),
    addresses: z.number(),
  }),
});

// Step 1: Read documents from folder
const readDocumentsStep = createStep({
  id: 'read-documents',
  description: 'Read all documents from the specified folder',
  inputSchema: workflowInputSchema,
  outputSchema: z.object({
    documents: z.array(z.object({
      id: z.string(),
      filename: z.string(),
      content: z.string(),
    })),
    count: z.number(),
  }),
  execute: async ({ inputData }) => {
    const result = await readDocsTool.execute({
      context: { folderPath: inputData.folderPath },
      runId: 'workflow-read',
      mastra: {} as any,
      runtimeContext: {} as any,
    });

    return {
      documents: result.documents.map(doc => ({
        id: doc.id,
        filename: doc.filename,
        content: typeof doc.content === 'string' ? doc.content : JSON.stringify(doc.content),
      })),
      count: result.count,
    };
  },
});

// Step 2: Process documents sequentially (one at a time to avoid rate limits)
const processDocumentsStep = createStep({
  id: 'process-documents',
  description: 'Classify and extract keys from all documents (sequential to avoid rate limits)',
  inputSchema: z.object({
    documents: z.array(z.object({
      id: z.string(),
      filename: z.string(),
      content: z.string(),
    })),
    count: z.number(),
  }),
  outputSchema: z.object({
    processedDocs: z.array(processedDocumentSchema),
  }),
  execute: async ({ inputData }) => {
    const processedDocs: z.infer<typeof processedDocumentSchema>[] = [];

    // Process documents one at a time to avoid rate limits
    for (const doc of inputData.documents) {
      console.log(`Processing document: ${doc.filename}`);

      // Classification and extraction can still run in parallel for each doc
      const [classification, extraction] = await Promise.all([
        classifyDocument(doc.content),
        extractKeys(doc.content),
      ]);

      processedDocs.push({
        id: doc.id,
        filename: doc.filename,
        classification,
        extraction,
      });

      console.log(`  -> Type: ${classification.documentType}, Lessor: ${extraction.lessor}`);
    }

    return { processedDocs };
  },
});

// Helper function for fuzzy matching
function findFuzzyMatch(needle: string, haystack: string[]): string | null {
  for (const candidate of haystack) {
    if (compareTwoStrings(needle.toLowerCase(), candidate.toLowerCase()) >= SIMILARITY_THRESHOLD) {
      return candidate;
    }
  }
  return null;
}

// Step 3: Group documents by lessor -> address -> leaseFile
const groupDocumentsStep = createStep({
  id: 'group-documents',
  description: 'Group documents by lessor, address, and document type',
  inputSchema: z.object({
    processedDocs: z.array(processedDocumentSchema),
  }),
  outputSchema: workflowOutputSchema,
  execute: async ({ inputData }) => {
    const hierarchy: Record<string, Record<string, z.infer<typeof leaseFileSchema>>> = {};
    const ungrouped: string[] = [];

    for (const doc of inputData.processedDocs) {
      const { lessor, address } = doc.extraction;

      // Skip documents with unknown lessor or address
      if (lessor === 'unknown' || address === 'unknown') {
        ungrouped.push(doc.id);
        continue;
      }

      // Find or create lessor group (with fuzzy matching)
      const existingLessors = Object.keys(hierarchy);
      const matchedLessor = findFuzzyMatch(lessor, existingLessors) || lessor;

      if (!hierarchy[matchedLessor]) {
        hierarchy[matchedLessor] = {};
      }

      // Find or create address group (with fuzzy matching)
      const existingAddresses = Object.keys(hierarchy[matchedLessor]);
      const matchedAddress = findFuzzyMatch(address, existingAddresses) || address;

      if (!hierarchy[matchedLessor][matchedAddress]) {
        hierarchy[matchedLessor][matchedAddress] = {
          baseLease: null,
          amendments: [],
          commencements: [],
          deliveries: [],
          others: [],
        };
      }

      const leaseFile = hierarchy[matchedLessor][matchedAddress];

      // Categorize document by type
      switch (doc.classification.documentType) {
        case 'lease':
          if (leaseFile.baseLease === null) {
            leaseFile.baseLease = doc.id;
          } else {
            leaseFile.others.push(doc.id);
          }
          break;
        case 'amendment':
          leaseFile.amendments.push(doc.id);
          break;
        case 'rent_commencement':
          leaseFile.commencements.push(doc.id);
          break;
        case 'delivery_letter':
          leaseFile.deliveries.push(doc.id);
          break;
        default:
          leaseFile.others.push(doc.id);
      }
    }

    // Calculate stats
    let groupedCount = 0;
    let addressCount = 0;
    for (const lessor of Object.keys(hierarchy)) {
      const addresses = Object.keys(hierarchy[lessor]);
      addressCount += addresses.length;
      for (const address of addresses) {
        const lf = hierarchy[lessor][address];
        groupedCount += (lf.baseLease ? 1 : 0) +
          lf.amendments.length +
          lf.commencements.length +
          lf.deliveries.length +
          lf.others.length;
      }
    }

    return {
      hierarchy,
      ungrouped,
      stats: {
        totalDocuments: inputData.processedDocs.length,
        groupedDocuments: groupedCount,
        ungroupedDocuments: ungrouped.length,
        lessors: Object.keys(hierarchy).length,
        addresses: addressCount,
      },
    };
  },
});

// Create the workflow
export const organizeDocumentsWorkflow = createWorkflow({
  id: 'organize-documents',
  description: 'Read, classify, extract, and group lease documents',
  inputSchema: workflowInputSchema,
  outputSchema: workflowOutputSchema,
})
  .then(readDocumentsStep)
  .then(processDocumentsStep)
  .then(groupDocumentsStep)
  .commit();

export type OrganizeDocumentsInput = z.infer<typeof workflowInputSchema>;
export type OrganizeDocumentsOutput = z.infer<typeof workflowOutputSchema>;
