// ListingGenius API Utilities
//
// ⚠️  SECURITY WARNING - DEPRECATED ⚠️
//
// This file contains DIRECT API calls that expose API keys on the client side.
// DO NOT use these functions in production!
//
// Instead, use the backend proxy via:
//   - backend-api.js for all API calls
//   - Backend endpoints: /api/openai/chat, /api/openai/vision, /api/keywords/search
//
// The backend proxy provides:
//   - API key protection (keys never exposed to client)
//   - Rate limiting
//   - Usage tracking
//   - User authentication
//
// This file is kept for reference/development only.
// TODO: Remove this file once backend integration is complete.

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Call OpenAI Chat Completions API
 * @param {string} prompt - The prompt to send
 * @param {Object} options - Configuration options
 * @returns {Promise<string>} - The response content
 */
export async function callOpenAI(prompt, options = {}) {
  const {
    apiKey,
    model = 'gpt-4o-mini',
    temperature = 0.7,
    maxTokens = 1000,
    responseFormat = null
  } = options;

  if (!apiKey) {
    throw new Error('OpenAI API key is required');
  }

  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature,
    max_tokens: maxTokens
  };

  if (responseFormat === 'json') {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error?.message || `API error: ${response.status}`;
    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * Analyze an image using OpenAI Vision API
 * @param {string} imageUrl - URL of the image to analyze
 * @param {string} prompt - The analysis prompt
 * @param {string} apiKey - OpenAI API key
 * @returns {Promise<string>} - The analysis result
 */
export async function analyzeImage(imageUrl, prompt, apiKey) {
  if (!apiKey) {
    throw new Error('OpenAI API key is required');
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }],
      max_tokens: 500
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Image analysis failed: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * Call Keywords Everywhere API for keyword data
 * @param {string[]} keywords - Keywords to look up
 * @param {string} apiKey - Keywords Everywhere API key
 * @returns {Promise<Object>} - Keyword data
 */
export async function callKeywordsEverywhereAPI(keywords, apiKey) {
  const KEYWORDS_API_URL = 'https://api.keywordseverywhere.com/v1/get_keyword_data';

  const response = await fetch(KEYWORDS_API_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      dataSource: 'gkp',
      country: 'us',
      currency: 'USD',
      kw: keywords.join('\n')
    })
  });

  if (!response.ok) {
    throw new Error(`Keywords API error: ${response.status}`);
  }

  return await response.json();
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - The function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @returns {Promise<any>} - The function result
 */
export async function withRetry(fn, maxRetries = 3) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
