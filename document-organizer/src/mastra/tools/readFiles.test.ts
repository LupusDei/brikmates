import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readDocsTool } from './readFiles.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Helper to create execution context for tests
function createContext(context: { folderPath: string; extensions?: string[] }) {
  return {
    context,
    runId: 'test',
    mastra: {} as any,
    runtimeContext: {} as any,
  };
}

describe('readDocsTool', () => {
  const testDir = join(tmpdir(), 'readDocsTool-test-' + Date.now());

  beforeAll(async () => {
    // Create test directory and files
    await mkdir(testDir, { recursive: true });
    await writeFile(join(testDir, 'doc1.txt'), 'This is a text document.');
    await writeFile(join(testDir, 'doc2.json'), JSON.stringify({ title: 'JSON Doc', value: 42 }));
    await writeFile(join(testDir, 'doc3.md'), '# Markdown\n\nThis is markdown.');
    await writeFile(join(testDir, 'ignored.pdf'), 'PDF content (not supported)');
    await writeFile(join(testDir, 'invalid.json'), 'not valid json');
  });

  afterAll(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
  });

  it('reads all supported documents from a folder', async () => {
    const result = await readDocsTool.execute(createContext({ folderPath: testDir }));

    expect(result.count).toBe(4); // txt, json, md, invalid.json
    expect(result.documents).toHaveLength(4);
    expect(result.errors).toBeUndefined();
  });

  it('filters by specific extensions', async () => {
    const result = await readDocsTool.execute(
      createContext({ folderPath: testDir, extensions: ['.txt'] })
    );

    expect(result.count).toBe(1);
    expect(result.documents[0].filename).toBe('doc1.txt');
    expect(result.documents[0].content).toBe('This is a text document.');
  });

  it('parses JSON content correctly', async () => {
    const result = await readDocsTool.execute(
      createContext({ folderPath: testDir, extensions: ['.json'] })
    );

    const validDoc = result.documents.find(d => d.filename === 'doc2.json');
    expect(validDoc?.content).toEqual({ title: 'JSON Doc', value: 42 });
  });

  it('handles invalid JSON gracefully', async () => {
    const result = await readDocsTool.execute(
      createContext({ folderPath: testDir, extensions: ['.json'] })
    );

    const invalidDoc = result.documents.find(d => d.filename === 'invalid.json');
    expect(invalidDoc?.content).toBe('not valid json'); // Returns raw string
  });

  it('returns error for non-existent folder', async () => {
    const result = await readDocsTool.execute(
      createContext({ folderPath: '/nonexistent/folder/path' })
    );

    expect(result.count).toBe(0);
    expect(result.documents).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0].error).toContain('Folder not found');
  });

  it('includes extension in document metadata', async () => {
    const result = await readDocsTool.execute(createContext({ folderPath: testDir }));

    const txtDoc = result.documents.find(d => d.filename === 'doc1.txt');
    expect(txtDoc?.extension).toBe('.txt');

    const mdDoc = result.documents.find(d => d.filename === 'doc3.md');
    expect(mdDoc?.extension).toBe('.md');
  });

  it('sorts documents by filename', async () => {
    const result = await readDocsTool.execute(createContext({ folderPath: testDir }));

    const filenames = result.documents.map(d => d.filename);
    const sorted = [...filenames].sort();
    expect(filenames).toEqual(sorted);
  });

  it('extracts document id without extension', async () => {
    const result = await readDocsTool.execute(
      createContext({ folderPath: testDir, extensions: ['.txt'] })
    );

    expect(result.documents[0].id).toBe('doc1');
  });
});
