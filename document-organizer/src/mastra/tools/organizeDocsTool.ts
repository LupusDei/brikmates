import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { organizeDocuments, getSimplifiedOutput } from '../workflows/groupDocuments.js';

// Schema for lease file structure in output
const leaseFileSchema = z.object({
  baseLease: z.string().nullable(),
  amendments: z.array(z.string()),
  commencements: z.array(z.string()),
  deliveries: z.array(z.string()),
  others: z.array(z.string()),
});

export const organizeDocsTool = createTool({
  id: 'organize_documents',
  description: `Process and organize lease documents from a folder.
This tool reads all documents from the specified folder path, classifies each document
(lease, amendment, rent commencement, delivery letter, or other), extracts key information
(lessor, address, tenant), and groups them hierarchically by lessor and property address.

Use this when the user wants to:
- Process documents in a folder
- Organize lease files
- See how documents are grouped
- Understand the structure of their lease documents`,
  inputSchema: z.object({
    folderPath: z.string().describe('Absolute path to the folder containing documents to process'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    hierarchy: z.record(z.string(), z.record(z.string(), leaseFileSchema)).optional(),
    ungrouped: z.array(z.string()).optional(),
    stats: z.object({
      totalDocuments: z.number(),
      groupedDocuments: z.number(),
      ungroupedDocuments: z.number(),
      lessors: z.number(),
      addresses: z.number(),
    }).optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const { folderPath } = context;

    try {
      const result = await organizeDocuments(folderPath);
      const simplified = getSimplifiedOutput(result);

      return {
        success: true,
        hierarchy: simplified.hierarchy,
        ungrouped: simplified.ungrouped,
        stats: simplified.stats,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error processing documents',
      };
    }
  },
});
