import { describe, it, expect } from 'vitest';
import { organizeDocsTool } from './organizeDocsTool.js';

describe('organizeDocsTool', () => {
  it('has correct tool configuration', () => {
    expect(organizeDocsTool.id).toBe('organize_documents');
    expect(organizeDocsTool.description).toContain('Process and organize lease documents');
  });

  it('has input schema requiring folderPath', () => {
    const inputSchema = organizeDocsTool.inputSchema;

    // Valid input should pass
    const validResult = inputSchema.safeParse({ folderPath: '/some/path' });
    expect(validResult.success).toBe(true);

    // Missing folderPath should fail
    const invalidResult = inputSchema.safeParse({});
    expect(invalidResult.success).toBe(false);
  });

  it('has output schema with expected fields', () => {
    const outputSchema = organizeDocsTool.outputSchema;

    // Success case
    const successResult = outputSchema.safeParse({
      success: true,
      hierarchy: {
        'ABC Corp': {
          '123 main street': {
            baseLease: 'lease-001',
            amendments: ['amendment-001'],
            commencements: [],
            deliveries: [],
            others: [],
          },
        },
      },
      ungrouped: [],
      stats: {
        totalDocuments: 2,
        groupedDocuments: 2,
        ungroupedDocuments: 0,
        lessors: 1,
        addresses: 1,
      },
    });
    expect(successResult.success).toBe(true);

    // Error case
    const errorResult = outputSchema.safeParse({
      success: false,
      error: 'Folder not found',
    });
    expect(errorResult.success).toBe(true);
  });

  it('returns empty result for non-existent folder', async () => {
    const result = await organizeDocsTool.execute({
      context: { folderPath: '/nonexistent/folder/path' },
      runId: 'test-run',
      mastra: {} as any,
      runtimeContext: {} as any,
    });

    // Non-existent folder returns success with 0 documents
    expect(result.success).toBe(true);
    expect(result.stats?.totalDocuments).toBe(0);
  });
});
