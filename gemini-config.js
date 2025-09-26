
/**
 * Gemini Model Configuration
 * Fine-tune OCR settings and prompts for optimal text recognition
 * Vanilla JavaScript configuration file
 */

const GeminiConfig = {
    // Model settings
    model: {
        name: 'gemma-3-27b-it',
        temperature: 0.1,
        maxOutputTokens: 1024,
        topP: 0.8,
        topK: 40
    },

    // OCR Prompts - Choose based on your use case
    prompts: {
        // Default OCR prompt - good for general text recognition
        default: 'Extract all text from this image. Return only the text content without any additional formatting or explanation.',

        // Custom Invoice/PO/DO/SO OCR prompt - for structured document parsing
        invoice: `You are an OCR parser. Extract **row-level line items** from the provided document image(s). The document may be a PO/DO/SO/Invoice.

## FINAL OUTPUT
Return **RAW JSON ONLY**: an array of objects. **No Markdown, no code fences, no explanations.** If no valid rows, return \`[]\`.

## SCHEMA (strict)
Each object has exactly these keys in this order:
- "stock_code": string (min 3, max 100)
- "stock_desc": string (required, max 100)
- "remark": string (optional, only if stock_desc not empty, max 200)
- "quantity": number (required, can be 0; null only if truly unreadable)
- "unit_price": number (required, can be 0; null only if truly unreadable)

## ROW IDENTIFICATION
- Use header cues like **ITEM / NO. / DESCRIPTION / CODE / SKU / QTY / UNIT PRICE / AMOUNT** (or close variants).
- Treat each visual line beneath the header as one row.
- Ignore BARCODE/AMOUNT columns for the schema.

## ROW-INDEX FILTER (very important)
Treat leading **row indices** as non-data and **never** assign them to \`stock_code\`.
Row index patterns include:
- A 1–4 digit integer at line start, optionally followed by \`. \`, \`)\`, \`-\`, or whitespace (regex hint: \`^\s*\d{1,4}(?:[.)-]|\s)\`).
- Values under a column titled **ITEM**, **NO.**, **#**, **S/N**, or similar.
- Sequences that monotonically increase across rows (e.g., \`1,2,3…\`, \`01,02,03…\`).
If a candidate token matches the above, discard it as a row index.

## STOCK CODE DECISION RULES
Assign \`stock_code\` **conservatively** to avoid row-index confusion:
- **Preferred source**: a cell under headers like **CODE / STOCK CODE / SKU / ITEM CODE / PRODUCT CODE**.
- If no explicit code column is present, set \`stock_code\` only if **any** of the following is true:
  1) Token contains at least one letter \`[A–Z]\` (case-insensitive), e.g., \`BA0046\`.
  2) Token mixes digits with separators \`- _ / .\` (e.g., \`ABC-123\`, \`X/200\`, \`A_778\`).
  3) Token is **numeric-only with length ≥ 5** and is **not** part of a monotonic row-index sequence.
- **Do not** use a pure 1–4 digit integer as \`stock_code\` unless it is explicitly under a **CODE/SKU** header.
- Tokens like "our ref: BA0046" inside description notes should **not** automatically populate \`stock_code\` unless clearly labeled by a preceding keyword such as \`SKU\`, \`Code\`, \`Stock\`.

If no safe candidate exists, set "stock_code": "".

## NORMALIZATION
- Numbers: remove thousand separators, use \`.\` as the decimal point.
- Trim all strings.

## ANTI-NOISE (hard rules)
- Replace the following with "" at field level:
  - Any run of the **same character** of length **≥ 4** (regex hint: \`(.)\1{3,}\`), e.g., \`ddddd\`, \`-----\`, \`xxxxx\`, \`====\`.
  - Boilerplate sentences like "This purchase order …" (any language).
  - Lines mostly punctuation/symbols or obvious filler words like \`heading\`, \`lorem\`, \`test\`, \`asdf\`.
- After cleaning:
  - If **stock_desc** is empty → **discard the row** (do not output it).
  - If **stock_code** is noise or < 3 chars → set "stock_code": "".

## FIELD RULES
1) **stock_desc is required**; provide it even when stock_code is missing.
2) Only include **remark** if stock_desc is non-empty; keep product-specific notes (no boilerplate).
3) Enforce max lengths via **hard truncation** (UTF-8 safe).
4) Use \`null\` only for unreadable numbers (0 is valid).

## MULTI-IMAGE HANDLING
- Process images independently; aggregate all valid rows into a single array.

## SELF-CHECK (must be true before emitting)
- Output is valid JSON (no comments/trailing commas).
- Every object has **non-empty stock_desc**, and numeric \`quantity\`/\`unit_price\` (or \`null\`).
- **No string contains a same-character run ≥ 4** after cleaning.
- Keys are exactly the five listed; no extras.
- Extra guard: if the set of \`stock_code\` values equals a simple sequence like \`{1,2,3,...}\` or \`{01,02,03,...}\`, then **clear all** those codes to "".

## IMPORTANT
- Use only the provided image content. Do not invent or copy examples.`,

        // Detailed OCR prompt - better for complex documents
        detailed: 'Extract all visible text from this image with high accuracy. Include any numbers, symbols, and special characters. Return only the raw text content without formatting, headers, or explanations.',

        // Medical OCR prompt - optimized for medical documents
        medical: 'Extract all medical text from this image including patient information, medications, dosages, and clinical notes. Be precise with medical terminology and numbers. Return only the text content.',

        // Receipt OCR prompt - optimized for receipts and invoices
        receipt: 'Extract all text from this receipt or invoice. Include item names, prices, quantities, totals, and any reference numbers. Return only the text content without additional commentary.',

        // ID Card OCR prompt - optimized for identification documents
        idCard: 'Extract all text from this identification document. Include name, ID number, date of birth, address, and any other visible information. Return only the text content.',

        // Handwriting OCR prompt - optimized for handwritten text
        handwriting: 'Extract all handwritten text from this image. Pay special attention to cursive writing, signatures, and handwritten notes. Return only the text content.',

        // Multilingual OCR prompt - for mixed language documents
        multilingual: 'Extract all text from this image regardless of language. Include text in any script or language present. Return only the text content without translation.',

        // Technical OCR prompt - for technical documents and code
        technical: 'Extract all text from this technical document or image. Include code snippets, technical specifications, diagrams labels, and any alphanumeric content. Preserve formatting where possible and return the raw text.'
    },

    // Rate limiting settings
    rateLimit: {
        retryDelay: 5000, // milliseconds to wait before retry
        maxRetries: 1,    // maximum number of retries
        backoffMultiplier: 2 // exponential backoff multiplier
    },

    // Text filtering - patterns that indicate no text was found
    noTextPatterns: [
        'there is no text',
        'no text visible',
        'no discernible text',
        'no text detected',
        'no text found',
        'no readable text',
        'no text in the image',
        'text not found',
        'no text available',
        'i cannot see any text',
        'no visible text',
        'no text present',
        'there is no visible text',
        'no text can be extracted',
        'no text is visible',
        'there is no text in the image',
        'no text appears',