/**
 * OpenAI Chat Completions Proxy
 * ListingGenius Backend
 *
 * Securely proxies requests to OpenAI API
 */

import { authenticate, checkAccess, PLAN_LIMITS } from '../../lib/auth.js';
import { rateLimit, getRateLimitHeaders } from '../../lib/ratelimit.js';
import { trackApiCall, hasQuota } from '../../lib/usage.js';
import { json, error, success, sanitizeError } from '../../lib/response.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export const config = {
  runtime: 'edge',
  maxDuration: 60
};

export default async function handler(req) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  if (req.method !== 'POST') {
    return error('Method not allowed', 405);
  }

  try {
    // Authenticate request
    const auth = await authenticate(req);
    if (!auth.authenticated) {
      return error(auth.error, 401, 'UNAUTHORIZED');
    }

    const user = auth.user;

    // Check rate limit
    const rateLimitResult = await rateLimit(req, user);
    if (!rateLimitResult.allowed) {
      return error(rateLimitResult.error, 429, 'RATE_LIMITED');
    }

    // Check usage quota
    const limits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;
    const quota = await hasQuota(user.id, 'listings', limits.listingsPerMonth);
    if (!quota.hasQuota) {
      return error(
        `Monthly listing limit reached (${quota.limit}). Upgrade for more.`,
        402,
        'QUOTA_EXCEEDED'
      );
    }

    // Parse request body
    const body = await req.json();
    const { prompt, model = 'gpt-4o-mini', temperature = 0.7, maxTokens = 1000, responseFormat } = body;

    if (!prompt) {
      return error('Prompt is required', 400, 'MISSING_PROMPT');
    }

    // Validate model access
    if (!limits.models.includes(model)) {
      return error(
        `Model ${model} not available on your plan. Available: ${limits.models.join(', ')}`,
        403,
        'MODEL_NOT_ALLOWED'
      );
    }

    // Check API key
    if (!OPENAI_API_KEY) {
      return error('OpenAI API not configured', 500, 'CONFIG_ERROR');
    }

    // Build OpenAI request
    const openaiBody = {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_tokens: maxTokens
    };

    if (responseFormat === 'json') {
      openaiBody.response_format = { type: 'json_object' };
    }

    // Call OpenAI API
    const openaiResponse = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(openaiBody)
    });

    if (!openaiResponse.ok) {
      const errData = await openaiResponse.json().catch(() => ({}));
      const errMessage = errData.error?.message || `OpenAI API error: ${openaiResponse.status}`;
      return error(sanitizeError(errMessage), openaiResponse.status, 'OPENAI_ERROR');
    }

    const data = await openaiResponse.json();
    const content = data.choices[0]?.message?.content;

    // Track usage
    await trackApiCall(user.id, 'openai/chat', { model, tokens: data.usage?.total_tokens });

    // Return response
    return success(
      { content, model, usage: data.usage },
      {
        headers: getRateLimitHeaders(rateLimitResult),
        quota: {
          remaining: quota.remaining - 1,
          limit: quota.limit
        }
      }
    );
  } catch (err) {
    console.error('OpenAI proxy error:', err);
    return error(sanitizeError(err), 500, 'INTERNAL_ERROR');
  }
}
