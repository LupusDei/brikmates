# BrikMate Coding Exercise: Document Classification & Organization

## Overview

You're building part of BrikMate's document ingestion pipeline. Property management companies send us boxes of lease documents—often hundreds of files dumped in a single folder with inconsistent naming, no organization, and mixed document types.

Your job: **build a program that can take a folder of parsed lease documents and automatically organize them.**

## Time Limit

**~45-50 minutes** to build something working. Don't over-engineer—focus on getting a working demo.

## Input Data

This folder contains **16 JSON files** (`document_01.json` through `document_16.json`). Each file has this structure:

```json
{
  "filename": "lease_231_final.pdf",
  "url": "https://example.com/documents/lease_231_final",
  "parsed_text": "... full text extracted from the PDF ..."
}
```

The documents are a mix of:

- **Leases**: Original lease agreements (typically longest, contain tenant name, landlord, property address, rent terms, lease term)
- **Amendments**: Modifications to existing leases (reference the original lease, contain amendment number, effective date, changes to terms)
- **Rent Commencements**: Documents confirming when rent actually started (shorter, reference the lease, state commencement date)
- **Delivery Letters**: Documents confirming when the premises were delivered to the tenant
- **Other**: Miscellaneous related documents

## Your Task

Organize these documents into logical **"lease files"**. Each lease file should group:

1. One base lease
2. All amendments belonging to that lease
3. All rent commencements belonging to that lease
4. Any delivery letters or related documents

Your program should output a clear structure showing which documents belong together.

## Constraints & Guidance

- The documents are **messy and inconsistent**
  - Filenames won't help you (they're random)
  - Address formats vary
  - Tenant names might have typos or abbreviations
- You should use **AI/LLMs** to interpret the document text and make classification decisions
- Focus on **getting it working** over perfect accuracy
- Think about **how you'd structure this** if it were going into production

## What We're Looking For

1. **Does it work?** Can you demo it classifying and grouping a sample set?
2. **Architecture:** Is the code organized with clear responsibilities? Can we tell where classification logic lives vs. grouping logic vs. I/O?
3. **AI usage:** How are you using AI to solve the hard problem (interpreting inconsistent document text)?
4. **Problem-solving:** When you hit ambiguity or messy data, how do you handle it?

## Getting Started

Use whatever language, tools, and AI assistants you're comfortable with. We use TypeScript/Node, but use what you know.

### Environment Setup

This project requires **Node.js v20.19.6**. To set up your environment:

```bash
# Install and use the correct Node.js version
nvm install 20.19.6
nvm use 20.19.6

# Or from the project root, nvm will automatically use the correct version
cd /path/to/brikmate
nvm use  # This reads the .nvmrc file
```

If you want to use LLM APIs (OpenAI, Anthropic, etc.), let us know and we can provide API keys.

## Example Output

Your program might output something like:

```json
{
  "lease_files": [
    {
      "id": "lease_file_1",
      "base_lease": "document_08.json",
      "amendments": ["document_03.json", "document_16.json"],
      "delivery_letters": ["document_11.json"],
      "other": []
    },
    {
      "id": "lease_file_2",
      "base_lease": "document_04.json",
      "amendments": ["document_01.json", "document_09.json"],
      "delivery_letters": [],
      "other": []
    }
  ]
}
```

Or any other clear format that makes sense to you!

## Questions?

If you hit ambiguity or aren't sure about something, just ask! We want to see how you think through problems.

Good luck! 🚀
