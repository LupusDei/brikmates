import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

export const readDocsTool = createTool({
  id: 'read_docs',
  description: 'Read all JSON documents from a specified folder',
  inputSchema: z.object({
    folderPath: z.string().describe('Path to the folder containing JSON documents'),
  }),
  outputSchema: z.object({
    documents: z.array(z.object({
      id: z.string(),
      filename: z.string(),
      content: z.any(),
    })),
    count: z.number(),
  }),
  execute: async ({ context }) => {
    const { folderPath } = context;
    const files = await readdir(folderPath);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const documents = await Promise.all(
      jsonFiles.map(async (filename) => {
        const filePath = join(folderPath, filename);
        const content = await readFile(filePath, 'utf-8');
        return {
          id: filename.replace('.json', ''),
          filename,
          content: JSON.parse(content),
        };
      })
    );

    return {
      documents,
      count: documents.length,
    };
  },
});
