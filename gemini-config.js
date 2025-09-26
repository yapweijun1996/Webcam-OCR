/**
 * OCR JSON-Only Config (Gemini/Gemma friendly)
 * Exposes: window.GeminiConfig
 * Note: your "Gemini" name is fine, but model is Gemma (gemma-3-27b-it).
 */

window.GeminiConfig = {
  // Available models
  models: {
    'gemma-3-27b-it': {
      name: 'gemma-3-27b-it',
      displayName: 'Gemma 3 27B (Advanced OCR)',
      temperature: 0,
      maxOutputTokens: 1024,
      topP: 0.8,
      topK: 40,
      apiEndpoint: 'generateContent',
      supportsStreaming: false,
      description: 'High accuracy model for complex text recognition'
    },
    'gemini-2.5-flash-lite': {
      name: 'gemini-2.5-flash-lite',
      displayName: 'Gemini 2.5 Flash Lite (Fast)',
      temperature: 0,
      maxOutputTokens: 1024,
      topP: 0.8,
      topK: 40,
      apiEndpoint: 'generateContent',
      supportsStreaming: false,
      description: 'Fast model optimized for speed and efficiency'
    },
    'gemini-2.5-flash': {
      name: 'gemini-2.5-flash',
      displayName: 'Gemini 2.5 Flash',
      temperature: 0,
      maxOutputTokens: 1024,
      topP: 0.8,
      topK: 40,
      apiEndpoint: 'generateContent',
      supportsStreaming: false,
      description: 'A slightly more powerful flash model.',
      thinkingConfig: {
        thinkingBudget: 512
      }
    }
  },

  // Default model
  defaultModel: 'gemini-2.5-flash-lite',

  // Get current model config
  getCurrentModel: function() {
    return this.models[this.defaultModel];
  },

  prompts: {
    /** A) Single string */
    jsonText: [
      'You are an OCR text extractor. Your ONLY task is to extract readable text from images.',
      'Output VALID JSON ONLY. No explanations, no descriptions, no markdown, no code fences.',
      'If no text is found, return "{"text": ""}."',
      'IMPORTANT: Do not describe the image, do not identify objects, do not analyze content.',
      'IMPORTANT: Only extract actual text characters that appear in the image.',
      'Rules:',
      '- UTF-8 JSON, no trailing commas.',
      '- Preserve characters exactly as they appear; do not translate.',
      '- Normalize multiple spaces to single; keep line breaks as \\n.',
      '- Do not invent or add any text that is not actually visible.',
      '- Ignore drawings, illustrations, and non-text elements.',
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
