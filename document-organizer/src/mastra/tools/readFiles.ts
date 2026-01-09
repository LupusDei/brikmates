import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { readdir, readFile, stat } from 'fs/promises';
import { join, extname, basename } from 'path';

// Supported file extensions and their content types
const SUPPORTED_EXTENSIONS = ['.json', '.txt', '.md', '.text'] as const;
type SupportedExtension = typeof SUPPORTED_EXTENSIONS[number];

function isSupportedExtension(ext: string): ext is SupportedExtension {
  return SUPPORTED_EXTENSIONS.includes(ext.toLowerCase() as SupportedExtension);
}

// Parse file content based on extension
function parseContent(content: string, ext: string): string | object {
  if (ext.toLowerCase() === '.json') {
    try {
      return JSON.parse(content);
    } catch {
      // Return raw content if JSON parsing fails
      return content;
    }
  }
  return content;
}

export const readDocsTool = createTool({
  id: 'read_docs',
  description: 'Read all documents from a specified folder. Supports JSON, TXT, and MD files.',
  inputSchema: z.object({
    folderPath: z.string().describe('Path to the folder containing documents'),
    extensions: z.array(z.string()).optional().describe('File extensions to include (e.g., [".txt", ".json"]). Defaults to all supported types.'),
  }),
  outputSchema: z.object({
    documents: z.array(z.object({
      id: z.string(),
      filename: z.string(),
      extension: z.string(),
      content: z.any(),
    })),
    count: z.number(),
    errors: z.array(z.object({
      filename: z.string(),
      error: z.string(),
    })).optional(),
  }),
  execute: async ({ context }) => {
    const { folderPath, extensions } = context;

    // Validate folder exists
    try {
      const folderStat = await stat(folderPath);
      if (!folderStat.isDirectory()) {
        return {
          documents: [],
          count: 0,
          errors: [{ filename: folderPath, error: 'Path is not a directory' }],
        };
      }
    } catch (error) {
      return {
        documents: [],
        count: 0,
        errors: [{ filename: folderPath, error: `Folder not found: ${folderPath}` }],
      };
    }

    const files = await readdir(folderPath);

    // Filter by extensions
    const allowedExtensions = extensions?.length
      ? extensions.map(e => e.toLowerCase())
      : [...SUPPORTED_EXTENSIONS];

    const matchingFiles = files.filter(f => {
      const ext = extname(f).toLowerCase();
      return allowedExtensions.includes(ext) && isSupportedExtension(ext);
    });

    const documents: Array<{ id: string; filename: string; extension: string; content: string | object }> = [];
    const errors: Array<{ filename: string; error: string }> = [];

    await Promise.all(
      matchingFiles.map(async (filename) => {
        const filePath = join(folderPath, filename);
        const ext = extname(filename);

        try {
          const content = await readFile(filePath, 'utf-8');
          documents.push({
            id: basename(filename, ext),
            filename,
            extension: ext,
            content: parseContent(content, ext),
          });
        } catch (error) {
          errors.push({
            filename,
            error: error instanceof Error ? error.message : 'Unknown error reading file',
          });
        }
      })
    );

    // Sort documents by filename for consistent ordering
    documents.sort((a, b) => a.filename.localeCompare(b.filename));

    return {
      documents,
      count: documents.length,
      ...(errors.length > 0 && { errors }),
    };
  },
});
