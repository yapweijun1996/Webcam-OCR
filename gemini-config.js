/**
  * OCR Text-Only Config (Gemini 2.5 Flash)
  * Exposes: window.GeminiConfig
  */

window.GeminiConfig = {
  // Available models
  models: {
    'gemini-2.5-flash-lite': {
      name: 'gemini-2.5-flash-lite',
      displayName: 'Gemini 2.5 Flash Lite (Fast)',
      temperature: 0,
      maxOutputTokens: 1024,
      topP: 0.8,
      topK: 40,
      apiEndpoint: 'generateContent',
      supportsStreaming: false,
      description: 'Fast model optimized for speed and efficiency',
      thinkingConfig: {
        thinkingBudget: 512
      }
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
    /** Text-only output (no JSON) */
    textOnly: [
      'You are an OCR text extractor. Extract ONLY the visible text from the image.',
      'Respond with TEXT ONLY: no JSON, no markdown, no code fences, no explanations.',
      'Do NOT describe the image, do NOT identify objects, do NOT analyze content.',
      'Rules:',
      '- Preserve characters exactly as they appear; do not translate.',
      '- Normalize multiple spaces to single; keep original line breaks using real newline characters.',
      '- Do not invent or add any text that is not actually visible.',
      '- Ignore drawings, illustrations, and non-text elements.',
      '- If any character is uncertain or ambiguous, OMIT it; never guess or fabricate.',
      '- If the image is blurred, low-resolution, over-exposed, under-exposed, out-of-focus, or otherwise unreadable: respond EXACTLY with: no text detect and image blur',
      '- If nothing is readable after omitting uncertain parts: respond EXACTLY with: no text detect and image blur'
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
    'no visible text',
    'image blur',
    'blurred',
    'blurry',
    'too blurry',
    'no text detect and image blur'
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
