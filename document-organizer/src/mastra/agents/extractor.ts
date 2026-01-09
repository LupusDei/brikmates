import { Agent } from '@mastra/core/agent';
import { z } from 'zod';

// Zod schema for extracted lease document keys
export const extractionSchema = z.object({
  lessor: z.string().describe('The landlord or property owner'),
  address: z.string().describe('The normalized property address'),
  tenant: z.string().describe('The lessee or renter'),
  baseReference: z.string().optional().describe('Reference to base lease for amendments'),
});

export type ExtractionResult = z.infer<typeof extractionSchema>;

// Address normalization function
export function normalizeAddress(address: string): string {
  // Convert to lowercase and trim
  let normalized = address.toLowerCase().trim();

  // Remove extra spaces
  normalized = normalized.replace(/\s+/g, ' ');

  // Standardize common abbreviations (use word boundaries to avoid partial matches)
  const abbreviations: Array<[RegExp, string]> = [
    [/\bst\.(?=\s|,|$)/gi, 'street'],
    [/\bst(?=\s|,|$)/gi, 'street'],
    [/\bave\.(?=\s|,|$)/gi, 'avenue'],
    [/\bave(?=\s|,|$)/gi, 'avenue'],
    [/\bblvd\.(?=\s|,|$)/gi, 'boulevard'],
    [/\bblvd(?=\s|,|$)/gi, 'boulevard'],
    [/\bdr\.(?=\s|,|$)/gi, 'drive'],
    [/\bdr(?=\s|,|$)/gi, 'drive'],
    [/\bln\.(?=\s|,|$)/gi, 'lane'],
    [/\bln(?=\s|,|$)/gi, 'lane'],
    [/\brd\.(?=\s|,|$)/gi, 'road'],
    [/\brd(?=\s|,|$)/gi, 'road'],
    [/\bct\.(?=\s|,|$)/gi, 'court'],
    [/\bct(?=\s|,|$)/gi, 'court'],
    [/\bcir\.(?=\s|,|$)/gi, 'circle'],
    [/\bcir(?=\s|,|$)/gi, 'circle'],
    [/\bpl\.(?=\s|,|$)/gi, 'place'],
    [/\bpl(?=\s|,|$)/gi, 'place'],
    [/\bpkwy\.(?=\s|,|$)/gi, 'parkway'],
    [/\bpkwy(?=\s|,|$)/gi, 'parkway'],
    [/\bhwy\.(?=\s|,|$)/gi, 'highway'],
    [/\bhwy(?=\s|,|$)/gi, 'highway'],
    [/\bste\.(?=\s|,|$)/gi, 'suite'],
    [/\bste(?=\s|,|$)/gi, 'suite'],
    [/\bapt\.(?=\s|,|$)/gi, 'apartment'],
    [/\bapt(?=\s|,|$)/gi, 'apartment'],
  ];

  for (const [pattern, replacement] of abbreviations) {
    normalized = normalized.replace(pattern, replacement);
  }

  // Remove periods after numbers (e.g., "123." -> "123")
  normalized = normalized.replace(/(\d)\./g, '$1');

  return normalized;
}

export const extractorAgent = new Agent({
  name: 'key-extractor',
  instructions: `You are a key extraction agent for lease documents.

Extract the following hierarchy keys from each document:
1. Lessor (primary key) - The landlord or property owner
2. Property Address (secondary key) - Extract the full address as written
3. Tenant - The lessee or renter

For amendments and related documents:
- Extract any reference to the base lease (date, ID, or identifying info) as baseReference
- This helps link documents to their parent lease file

Be precise and extract exactly what is written in the document.
If a field cannot be found, use "unknown" as the value.`,
  model: 'anthropic/claude-sonnet-4-20250514',
});

// Extract keys from document text with structured output
export async function extractKeys(docText: string): Promise<ExtractionResult> {
  const response = await extractorAgent.generate(
    `Extract the lessor, property address, tenant, and any base lease reference from this document:

${docText}`,
    {
      output: extractionSchema,
    }
  );

  const result = response.object as ExtractionResult;

  // Normalize the address
  return {
    ...result,
    address: normalizeAddress(result.address),
  };
}
