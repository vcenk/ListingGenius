/**
 * fal.ai Image Processing Proxy
 * ListingGenius Backend
 *
 * Securely proxies image processing requests to fal.ai
 */

import { authenticate, PLAN_LIMITS } from '../../lib/auth.js';
import { rateLimit, getRateLimitHeaders } from '../../lib/ratelimit.js';
import { trackApiCall, hasQuota } from '../../lib/usage.js';
import { json, error, success, sanitizeError } from '../../lib/response.js';

const FAL_API_BASE = 'https://queue.fal.run';
const FAL_API_KEY = process.env.FAL_API_KEY;

// Model endpoints
const MODELS = {
  birefnet: 'fal-ai/birefnet',
  bria_rmbg: 'fal-ai/bria/background/remove',
  bria_replace: 'fal-ai/bria/background/replace',
  flux_kontext: 'fal-ai/flux-pro/kontext',
  flux_fill: 'fal-ai/flux-pro/v1/fill',
  flux_redux: 'fal-ai/flux/dev/redux',
  flux_dev: 'fal-ai/flux/dev',
  aura_sr: 'fal-ai/aura-sr',
  esrgan: 'fal-ai/esrgan'
};

// Credit costs per operation
const CREDIT_COSTS = {
  remove_background: 1,
  white_background: 2,
  lifestyle: 3,
  upscale: 1,
  variations: 3
};

// Allowed image URL domains
const ALLOWED_IMAGE_DOMAINS = [
  'fal.run', 'fal.ai', 'storage.fal.run',
  'etsy.com', 'etsystatic.com',
  'amazon.com', 'media-amazon.com', 'images-amazon.com',
  'ssl-images-amazon.com', 'm.media-amazon.com'
];

export const config = {
  runtime: 'edge',
  maxDuration: 120 // 2 minutes for image processing
};

function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('data:image/')) return true;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    return ALLOWED_IMAGE_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

async function callFalApi(model, input) {
  const submitResponse = await fetch(`${FAL_API_BASE}/${model}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Key ${FAL_API_KEY}`
    },
    body: JSON.stringify(input)
  });

  if (!submitResponse.ok) {
    const err = await submitResponse.json().catch(() => ({}));
    throw new Error(err.detail || `fal.ai API error: ${submitResponse.status}`);
  }

  const { request_id, status } = await submitResponse.json();

  if (status === 'COMPLETED') {
    return await getQueueResult(model, request_id);
  }

  return await pollForResult(model, request_id);
}

async function pollForResult(model, requestId, maxAttempts = 60) {
  const pollInterval = 2000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, pollInterval));

    const statusResponse = await fetch(
      `${FAL_API_BASE}/${model}/requests/${requestId}/status`,
      { headers: { 'Authorization': `Key ${FAL_API_KEY}` } }
    );

    if (!statusResponse.ok) continue;

    const statusData = await statusResponse.json();

    if (statusData.status === 'COMPLETED') {
      return await getQueueResult(model, requestId);
    }

    if (statusData.status === 'FAILED') {
      throw new Error(statusData.error || 'Image processing failed');
    }
  }

  throw new Error('Request timed out');
}

async function getQueueResult(model, requestId) {
  const response = await fetch(
    `${FAL_API_BASE}/${model}/requests/${requestId}`,
    { headers: { 'Authorization': `Key ${FAL_API_KEY}` } }
  );

  if (!response.ok) {
    throw new Error(`Failed to get result: ${response.status}`);
  }

  return await response.json();
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
    const { operation, imageUrl, options = {} } = body;

    if (!operation) {
      return error('Operation is required', 400, 'MISSING_OPERATION');
    }

    if (!imageUrl) {
      return error('Image URL is required', 400, 'MISSING_IMAGE');
    }

    // Validate image URL
    if (!isValidImageUrl(imageUrl)) {
      return error('Invalid or unauthorized image URL', 400, 'INVALID_IMAGE_URL');
    }

    // Check credits
    const creditCost = CREDIT_COSTS[operation] || 1;
    const limits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;
    const quota = await hasQuota(user.id, 'imageCredits', limits.imageCredits);

    if (!quota.hasQuota || quota.remaining < creditCost) {
      return error(
        `Insufficient image credits. Need ${creditCost}, have ${quota.remaining || 0}.`,
        402,
        'INSUFFICIENT_CREDITS'
      );
    }

    // Check API key
    if (!FAL_API_KEY) {
      return error('fal.ai API not configured', 500, 'CONFIG_ERROR');
    }

    let result;

    switch (operation) {
      case 'remove_background': {
        const model = options.model === 'bria' ? MODELS.bria_rmbg : MODELS.birefnet;
        const input = {
          image_url: imageUrl,
          output_format: options.outputFormat || 'png'
        };
        if (model === MODELS.birefnet) {
          input.refine_foreground = options.refineForeground !== false;
        }
        const apiResult = await callFalApi(model, input);
        result = {
          imageUrl: apiResult.image?.url || apiResult.image,
          originalUrl: imageUrl
        };
        break;
      }

      case 'white_background': {
        // First remove background
        const removedBg = await callFalApi(MODELS.birefnet, {
          image_url: imageUrl,
          output_format: 'png',
          refine_foreground: true
        });

        // Then replace with white
        const replaced = await callFalApi(MODELS.bria_replace, {
          image_url: removedBg.image?.url || removedBg.image,
          background_color: '#FFFFFF'
        });

        result = {
          imageUrl: replaced.image?.url || replaced.image,
          originalUrl: imageUrl,
          marketplace: 'amazon'
        };
        break;
      }

      case 'lifestyle': {
        if (!options.prompt) {
          return error('Prompt required for lifestyle generation', 400, 'MISSING_PROMPT');
        }

        // Remove background first
        const removedBg = await callFalApi(MODELS.birefnet, {
          image_url: imageUrl,
          output_format: 'png',
          refine_foreground: true
        });

        // Generate lifestyle scene
        const styleModifiers = {
          photorealistic: 'professional product photography, photorealistic, high quality, 8k',
          artistic: 'artistic product shot, creative lighting, aesthetic composition',
          minimal: 'minimalist setting, clean background, simple and elegant',
          cozy: 'warm and cozy atmosphere, soft lighting, inviting setting',
          luxury: 'luxury setting, premium quality, elegant atmosphere'
        };
        const style = styleModifiers[options.style] || styleModifiers.photorealistic;
        const enhancedPrompt = `${options.prompt}, ${style}, product centered and prominent`;

        const lifestyle = await callFalApi(MODELS.flux_kontext, {
          image_url: removedBg.image?.url || removedBg.image,
          prompt: enhancedPrompt,
          guidance_scale: options.guidanceScale || 7.5,
          num_inference_steps: options.numSteps || 28
        });

        result = {
          imageUrl: lifestyle.images?.[0]?.url || lifestyle.image?.url,
          originalUrl: imageUrl,
          prompt: enhancedPrompt
        };
        break;
      }

      case 'upscale': {
        const model = options.model === 'esrgan' ? MODELS.esrgan : MODELS.aura_sr;
        const apiResult = await callFalApi(model, {
          image_url: imageUrl,
          upscaling_factor: options.scale || 4
        });
        result = {
          imageUrl: apiResult.image?.url || apiResult.image,
          originalUrl: imageUrl,
          scale: options.scale || 4
        };
        break;
      }

      case 'variations': {
        const apiResult = await callFalApi(MODELS.flux_redux, {
          image_url: imageUrl,
          num_images: options.count || 3,
          strength: options.strength || 0.6,
          guidance_scale: options.guidanceScale || 7.5
        });
        const images = apiResult.images || [apiResult.image];
        result = {
          images: images.map(img => img?.url || img),
          originalUrl: imageUrl,
          count: images.length
        };
        break;
      }

      default:
        return error(`Unknown operation: ${operation}`, 400, 'INVALID_OPERATION');
    }

    // Track usage
    await trackApiCall(user.id, `fal/${operation}`, { credits: creditCost });

    return success(result, {
      headers: getRateLimitHeaders(rateLimitResult),
      credits: {
        used: creditCost,
        remaining: quota.remaining - creditCost
      }
    });
  } catch (err) {
    console.error('fal.ai proxy error:', err);
    return error(sanitizeError(err), 500, 'INTERNAL_ERROR');
  }
}
