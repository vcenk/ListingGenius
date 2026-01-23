/**
 * OpenAI Vision API Proxy
 * ListingGenius Backend
 *
 * Securely proxies image analysis requests to OpenAI
 */

import { authenticate, PLAN_LIMITS } from '../../lib/auth.js';
import { rateLimit, getRateLimitHeaders } from '../../lib/ratelimit.js';
import { trackApiCall } from '../../lib/usage.js';
import { json, error, success, sanitizeError } from '../../lib/response.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Allowed image URL domains
const ALLOWED_IMAGE_DOMAINS = [
  'fal.run',
  'fal.ai',
  'storage.fal.run',
  'etsy.com',
  'etsystatic.com',
  'amazon.com',
  'media-amazon.com',
  'images-amazon.com',
  'ssl-images-amazon.com',
  'm.media-amazon.com'
];

export const config = {
  runtime: 'edge',
  maxDuration: 60
};

/**
 * Validate image URL
 */
function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false;

  // Allow base64 data URLs
  if (url.startsWith('data:image/')) return true;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;

    const hostname = parsed.hostname.toLowerCase();
    return ALLOWED_IMAGE_DOMAINS.some(domain =>
      hostname === domain || hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  if (req.method !== 'POST') {
    return error('Method not allowed', 405);
  }

  try {
    // Authenticate
    const auth = await authenticate(req);
    if (!auth.authenticated) {
      return error(auth.error, 401, 'UNAUTHORIZED');
    }

    const user = auth.user;

    // Rate limit
    const rateLimitResult = await rateLimit(req, user);
    if (!rateLimitResult.allowed) {
      return error(rateLimitResult.error, 429, 'RATE_LIMITED');
    }

    // Parse request
    const body = await req.json();
    const { imageUrl, prompt } = body;

    if (!imageUrl) {
      return error('Image URL is required', 400, 'MISSING_IMAGE');
    }

    if (!prompt) {
      return error('Prompt is required', 400, 'MISSING_PROMPT');
    }

    // Validate image URL
    if (!isValidImageUrl(imageUrl)) {
      return error('Invalid or unauthorized image URL', 400, 'INVALID_IMAGE_URL');
    }

    // Check API key
    if (!OPENAI_API_KEY) {
      return error('OpenAI API not configured', 500, 'CONFIG_ERROR');
    }

    // Call OpenAI Vision API
    const openaiResponse = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
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

    if (!openaiResponse.ok) {
      const errData = await openaiResponse.json().catch(() => ({}));
      const errMessage = errData.error?.message || `Vision API error: ${openaiResponse.status}`;
      return error(sanitizeError(errMessage), openaiResponse.status, 'OPENAI_ERROR');
    }

    const data = await openaiResponse.json();
    const content = data.choices[0]?.message?.content;

    // Track usage
    await trackApiCall(user.id, 'openai/vision', { tokens: data.usage?.total_tokens });

    return success(
      { content, usage: data.usage },
      { headers: getRateLimitHeaders(rateLimitResult) }
    );
  } catch (err) {
    console.error('Vision proxy error:', err);
    return error(sanitizeError(err), 500, 'INTERNAL_ERROR');
  }
}
