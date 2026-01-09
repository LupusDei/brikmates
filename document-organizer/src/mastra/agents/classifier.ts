import { Agent } from '@mastra/core/agent';
import { z } from 'zod';

// Classification categories
export const DocumentType = z.enum([
  'lease',
  'amendment',
  'rent_commencement',
  'delivery_letter',
  'other'
]);

export type DocumentType = z.infer<typeof DocumentType>;

// Output schema for classification
export const ClassificationResultSchema = z.object({
  documentType: DocumentType,
  confidence: z.enum(['high', 'medium', 'low']),
  reasoning: z.string().describe('Brief explanation for the classification'),
});

export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;

export const classifierAgent = new Agent({
  name: 'doc-classifier',
  instructions: `You are a document classification agent for lease documents.

Classify each document into one of these categories:
- lease: A base/original lease agreement
- amendment: An amendment or modification to an existing lease
- rent_commencement: A rent commencement letter or notice
- delivery_letter: A delivery letter or notice
- other: Any other document type

IMPORTANT: Amendments are treated as changes to a living base lease document.
They should reference the original lease they modify.

When classifying, look for:
- Document titles and headers
- Legal language patterns
- References to other documents
- Date patterns and effective dates

Always respond with a JSON object containing:
- documentType: one of the categories above
- confidence: "high", "medium", or "low"
- reasoning: brief explanation for your classification`,
  model: 'anthropic/claude-sonnet-4-20250514',
});

/**
 * Classify a single document
 */
export async function classifyDocument(docText: string): Promise<ClassificationResult> {
  const response = await classifierAgent.generate(
    `Classify this document:\n\n${docText}`,
    { output: ClassificationResultSchema }
  );

  return response.object as ClassificationResult;
}

/**
 * Classify multiple documents in batch
 */
export async function classifyDocuments(
  documents: Array<{ id: string; text: string }>
): Promise<Array<{ id: string; classification: ClassificationResult }>> {
  const results = await Promise.all(
    documents.map(async (doc) => ({
      id: doc.id,
      classification: await classifyDocument(doc.text),
    }))
  );

  return results;
}
