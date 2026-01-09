#!/usr/bin/env node
import 'dotenv/config';
import { organizeDocuments, getSimplifiedOutput } from './mastra/index.js';

async function main() {
  const folderPath = process.argv[2];

  if (!folderPath) {
    console.error('Usage: npx tsx src/cli.ts <folder-path>');
    console.error('Example: npx tsx src/cli.ts ./documents');
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required');
    console.error('Set it in your .env file or export it:');
    console.error('  export ANTHROPIC_API_KEY=sk-ant-...');
    process.exit(1);
  }

  console.log(`\nOrganizing documents from: ${folderPath}\n`);

  try {
    const result = await organizeDocuments(folderPath);
    const output = getSimplifiedOutput(result);

    console.log('='.repeat(60));
    console.log('DOCUMENT ORGANIZATION RESULTS');
    console.log('='.repeat(60));
    console.log(`\nStats:`);
    console.log(`  Total documents: ${output.stats.totalDocuments}`);
    console.log(`  Grouped: ${output.stats.groupedDocuments}`);
    console.log(`  Ungrouped: ${output.stats.ungroupedDocuments}`);
    console.log(`  Lessors: ${output.stats.lessors}`);
    console.log(`  Addresses: ${output.stats.addresses}`);

    console.log('\n' + '-'.repeat(60));
    console.log('HIERARCHY');
    console.log('-'.repeat(60));

    for (const [lessor, addresses] of Object.entries(output.hierarchy)) {
      console.log(`\n[LESSOR] ${lessor}`);
      for (const [address, leaseFile] of Object.entries(addresses)) {
        console.log(`  [ADDRESS] ${address}`);
        console.log(`    Base Lease: ${leaseFile.baseLease || '(none)'}`);
        if (leaseFile.amendments.length > 0) {
          console.log(`    Amendments: ${leaseFile.amendments.join(', ')}`);
        }
        if (leaseFile.commencements.length > 0) {
          console.log(`    Commencements: ${leaseFile.commencements.join(', ')}`);
        }
        if (leaseFile.deliveries.length > 0) {
          console.log(`    Deliveries: ${leaseFile.deliveries.join(', ')}`);
        }
        if (leaseFile.others.length > 0) {
          console.log(`    Others: ${leaseFile.others.join(', ')}`);
        }
      }
    }

    if (output.ungrouped.length > 0) {
      console.log('\n' + '-'.repeat(60));
      console.log('UNGROUPED DOCUMENTS');
      console.log('-'.repeat(60));
      console.log(output.ungrouped.join(', '));
    }

    // Also output as JSON
    console.log('\n' + '-'.repeat(60));
    console.log('JSON OUTPUT');
    console.log('-'.repeat(60));
    console.log(JSON.stringify(output.hierarchy, null, 2));

  } catch (error) {
    console.error('Error organizing documents:', error);
    process.exit(1);
  }
}

main();
