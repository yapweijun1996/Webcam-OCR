/**
 * OCR JSON-Only Config (Gemini/Gemma friendly)
 * Exposes: window.GeminiConfig
 * Note: your "Gemini" name is fine, but model is Gemma (gemma-3-27b-it).
 */

window.GeminiConfig = {
  model: {
    name: 'gemma-3-27b-it',
    temperature: 0,          // make outputs deterministic
    maxOutputTokens: 1024,
    topP: 0.8,
    topK: 40,
    // If your client supports it, this strongly helps:
    // response_mime_type: 'application/json'
  },

  prompts: {
    /** A) Single string */
    jsonText: [
      'You are an OCR extractor.',
      'Output VALID JSON ONLY. No explanations, no markdown, no code fences.',
      'If nothing is readable, return {"text": ""}.',
      'Rules:',
      '- UTF-8 JSON, no trailing commas.',
      '- Preserve characters; do not translate.',
      '- Normalize multiple spaces to single; keep line breaks as \\n.',
      '- Do not invent text.',
      'Return exactly this schema:',
      '{"text":"string"}'
    ].join('\n'),

    /** B) Lines array (simplest structure) */
    jsonLines: [
      'You are an OCR extractor.',
      'Output VALID JSON ONLY. No explanations, no markdown, no code fences.',
      'If nothing is readable, return {"lines":[]}.',
      'Rules:',
      '- UTF-8 JSON, no trailing commas.',
      '- Preserve characters; do not translate.',
      '- Reading order: left-to-right, top-to-bottom.',
      '- Each line is one entry; do not merge unrelated lines.',
      '- Do not invent text.',
      'Return exactly this schema:',
      '{"lines":["string","string","..."]}'
    ].join('\n'),

    /** C) Multi-image/pages (supply page_id yourself) */
    jsonPages: [
      'You are an OCR extractor.',
      'Output VALID JSON ONLY. No explanations, no markdown, no code fences.',
      'If nothing is readable, return {"pages":[]}.',
      'Rules:',
      '- UTF-8 JSON, no trailing commas.',
      '- Preserve characters; do not translate.',
      '- For each image/page, return one object with page_id and its text.',
      '- Use \\n for line breaks inside "text".',
      '- Do not invent text.',
      'Return exactly this schema:',
      '{"pages":[{"page_id":"string","text":"string"}]}'
    ].join('\n')
  },

  // Rate limiting / retry policy for API calls
  rateLimit: {
    retryDelay: 5000,
    maxRetries: 1,
    backoffMultiplier: 1.5
  },

  // Detect "no text" style responses (still useful if model drifts)
  noTextPatterns: [
    'no text',
    'no text detected',
    'no text visible',
    'no readable text',
    'no text found',
    'no text in the image',
    'no visible text'
  ],

  /**
   * Optional: minimal validator + auto-fallback.
   * Use after model returns. Choose the schema that matches the prompt you used.
   */
  validator: {
    parseOrEmpty(jsonStr, schema = 'text') {
      try {
        const obj = JSON.parse(jsonStr);
        if (schema === 'text' && typeof obj?.text === 'string') return obj;
        if (schema === 'lines' && Array.isArray(obj?.lines) && obj.lines.every(x => typeof x === 'string')) return obj;
        if (schema === 'pages' && Array.isArray(obj?.pages) && obj.pages.every(p => p && typeof p.page_id === 'string' && typeof p.text === 'string')) return obj;
      } catch {}
      // Fallbacks match the schemas above
      if (schema === 'text')  return { text: '' };
      if (schema === 'lines') return { lines: [] };
      if (schema === 'pages') return { pages: [] };
    }
  }
};
