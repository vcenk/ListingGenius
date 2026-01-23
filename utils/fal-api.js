// ListingGenius fal.ai API Utilities

const FAL_API_BASE = 'https://queue.fal.run';

// Allowed image URL domains for security
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

/**
 * Validate image URL for security
 * @param {string} url - URL to validate
 * @returns {boolean} - Whether URL is valid and allowed
 */
function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Allow base64 data URLs
  if (url.startsWith('data:image/')) {
    return true;
  }

  try {
    const parsed = new URL(url);

    // Only allow HTTPS
    if (parsed.protocol !== 'https:') {
      return false;
    }

    // Check against allowed domains
    const hostname = parsed.hostname.toLowerCase();
    return ALLOWED_IMAGE_DOMAINS.some(domain =>
      hostname === domain || hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

/**
 * Validate base64 string format
 * @param {string} base64 - Base64 string to validate
 * @returns {boolean} - Whether format is valid
 */
function isValidBase64(base64) {
  if (!base64 || typeof base64 !== 'string') {
    return false;
  }

  // Check for data URL format
  const dataUrlPattern = /^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/]+=*$/;
  if (dataUrlPattern.test(base64)) {
    return true;
  }

  // Check raw base64
  const base64Pattern = /^[A-Za-z0-9+/]+=*$/;
  return base64Pattern.test(base64);
}

// Model endpoints
const MODELS = {
  // Background removal
  BIREFNET: 'fal-ai/birefnet',
  BRIA_RMBG: 'fal-ai/bria/background/remove',
  BRIA_REPLACE: 'fal-ai/bria/background/replace',

  // Image generation & editing
  FLUX_KONTEXT: 'fal-ai/flux-pro/kontext',
  FLUX_FILL: 'fal-ai/flux-pro/v1/fill',
  FLUX_REDUX: 'fal-ai/flux/dev/redux',
  FLUX_DEV: 'fal-ai/flux/dev',

  // Upscaling
  AURA_SR: 'fal-ai/aura-sr',
  ESRGAN: 'fal-ai/esrgan'
};

// Marketplace configurations
const MARKETPLACE_CONFIG = {
  etsy: {
    name: 'Etsy',
    imageRequirements: {
      minWidth: 2000,
      recommendedWidth: 3000,
      recommendedHeight: 2250,
      maxFileSize: 1024 * 1024,
      formats: ['jpg', 'png', 'gif'],
      aspectRatio: '4:3'
    },
    maxImages: 10
  },
  amazon: {
    name: 'Amazon',
    mainImage: {
      minWidth: 1000,
      recommendedWidth: 3000,
      recommendedHeight: 3000,
      maxFileSize: 10 * 1024 * 1024,
      formats: ['jpg', 'png', 'tiff', 'gif'],
      background: { r: 255, g: 255, b: 255 },
      productFill: 0.85,
      noText: true
    },
    maxImages: 9
  }
};

/**
 * Call fal.ai API with queue handling
 * @param {string} model - Model endpoint
 * @param {Object} input - Input parameters
 * @param {string} apiKey - fal.ai API key
 * @returns {Promise<Object>} - API response
 */
async function callFalApi(model, input, apiKey) {
  if (!apiKey) {
    throw new Error('fal.ai API key is required');
  }

  // Submit request to queue
  const submitResponse = await fetch(`${FAL_API_BASE}/${model}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Key ${apiKey}`
    },
    body: JSON.stringify(input)
  });

  if (!submitResponse.ok) {
    const error = await submitResponse.json().catch(() => ({}));
    throw new Error(error.detail || `fal.ai API error: ${submitResponse.status}`);
  }

  const { request_id, status } = await submitResponse.json();

  // If already completed, return result
  if (status === 'COMPLETED') {
    return await getQueueResult(model, request_id, apiKey);
  }

  // Poll for completion
  return await pollForResult(model, request_id, apiKey);
}

/**
 * Poll for queue result
 * @param {string} model - Model endpoint
 * @param {string} requestId - Request ID
 * @param {string} apiKey - API key
 * @returns {Promise<Object>} - Result
 */
async function pollForResult(model, requestId, apiKey, maxAttempts = 60) {
  const pollInterval = 2000; // 2 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(pollInterval);

    const statusResponse = await fetch(
      `${FAL_API_BASE}/${model}/requests/${requestId}/status`,
      {
        headers: {
          'Authorization': `Key ${apiKey}`
        }
      }
    );

    if (!statusResponse.ok) {
      continue; // Retry on error
    }

    const status = await statusResponse.json();

    if (status.status === 'COMPLETED') {
      return await getQueueResult(model, requestId, apiKey);
    }

    if (status.status === 'FAILED') {
      throw new Error(status.error || 'Image processing failed');
    }
  }

  throw new Error('Request timed out');
}

/**
 * Get result from queue
 * @param {string} model - Model endpoint
 * @param {string} requestId - Request ID
 * @param {string} apiKey - API key
 * @returns {Promise<Object>} - Result
 */
async function getQueueResult(model, requestId, apiKey) {
  const response = await fetch(
    `${FAL_API_BASE}/${model}/requests/${requestId}`,
    {
      headers: {
        'Authorization': `Key ${apiKey}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get result: ${response.status}`);
  }

  return await response.json();
}

/**
 * Remove background from image
 * @param {string} imageUrl - Image URL or base64
 * @param {Object} options - Options
 * @param {string} apiKey - API key
 * @returns {Promise<Object>} - Result with image URL
 */
export async function removeBackground(imageUrl, options = {}, apiKey) {
  // Security: Validate image URL
  if (!isValidImageUrl(imageUrl)) {
    throw new Error('Invalid or unauthorized image URL');
  }

  const {
    model = 'birefnet',
    refineForeground = true,
    outputFormat = 'png'
  } = options;

  const modelEndpoint = model === 'bria' ? MODELS.BRIA_RMBG : MODELS.BIREFNET;

  const input = {
    image_url: imageUrl,
    output_format: outputFormat
  };

  if (modelEndpoint === MODELS.BIREFNET) {
    input.refine_foreground = refineForeground;
  }

  const result = await callFalApi(modelEndpoint, input, apiKey);

  return {
    imageUrl: result.image?.url || result.image,
    originalUrl: imageUrl
  };
}

/**
 * Replace background with solid color or generated scene
 * @param {string} imageUrl - Image URL
 * @param {Object} options - Options
 * @param {string} apiKey - API key
 * @returns {Promise<Object>} - Result
 */
export async function replaceBackground(imageUrl, options = {}, apiKey) {
  // Security: Validate image URL
  if (!isValidImageUrl(imageUrl)) {
    throw new Error('Invalid or unauthorized image URL');
  }

  const {
    color = '#FFFFFF',
    prompt = null,
    refPosition = 'center'
  } = options;

  // If just a color replacement, use Bria Replace
  if (!prompt) {
    const input = {
      image_url: imageUrl,
      background_color: color
    };

    const result = await callFalApi(MODELS.BRIA_REPLACE, input, apiKey);

    return {
      imageUrl: result.image?.url || result.image,
      originalUrl: imageUrl,
      backgroundColor: color
    };
  }

  // If prompt provided, first remove background then use FLUX for scene generation
  const removedBg = await removeBackground(imageUrl, { outputFormat: 'png' }, apiKey);

  // Use FLUX Kontext for contextual background generation
  const fluxInput = {
    image_url: removedBg.imageUrl,
    prompt: prompt,
    guidance_scale: 7.5,
    num_inference_steps: 28
  };

  const result = await callFalApi(MODELS.FLUX_KONTEXT, fluxInput, apiKey);

  return {
    imageUrl: result.images?.[0]?.url || result.image?.url,
    originalUrl: imageUrl,
    prompt: prompt
  };
}

/**
 * Generate lifestyle image with product in scene
 * @param {string} productImageUrl - Product image URL
 * @param {string} scenePrompt - Scene description
 * @param {Object} options - Options
 * @param {string} apiKey - API key
 * @returns {Promise<Object>} - Result
 */
export async function generateLifestyleImage(productImageUrl, scenePrompt, options = {}, apiKey) {
  // Security: Validate image URL
  if (!isValidImageUrl(productImageUrl)) {
    throw new Error('Invalid or unauthorized image URL');
  }

  const {
    style = 'photorealistic',
    guidanceScale = 7.5,
    numSteps = 28
  } = options;

  // First remove background to isolate product
  const removedBg = await removeBackground(productImageUrl, { outputFormat: 'png' }, apiKey);

  // Build enhanced prompt
  const enhancedPrompt = buildLifestylePrompt(scenePrompt, style);

  // Generate lifestyle scene with FLUX Kontext
  const input = {
    image_url: removedBg.imageUrl,
    prompt: enhancedPrompt,
    guidance_scale: guidanceScale,
    num_inference_steps: numSteps
  };

  const result = await callFalApi(MODELS.FLUX_KONTEXT, input, apiKey);

  return {
    imageUrl: result.images?.[0]?.url || result.image?.url,
    originalUrl: productImageUrl,
    prompt: enhancedPrompt,
    style: style
  };
}

/**
 * Build enhanced prompt for lifestyle generation
 * @param {string} basePrompt - User's scene description
 * @param {string} style - Style preference
 * @returns {string} - Enhanced prompt
 */
function buildLifestylePrompt(basePrompt, style) {
  const styleModifiers = {
    photorealistic: 'professional product photography, photorealistic, high quality, 8k, sharp focus, commercial photography',
    artistic: 'artistic product shot, creative lighting, aesthetic composition, magazine quality',
    minimal: 'minimalist setting, clean background, simple and elegant, modern aesthetic',
    cozy: 'warm and cozy atmosphere, soft lighting, inviting setting, lifestyle photography',
    luxury: 'luxury setting, premium quality, elegant atmosphere, high-end product photography'
  };

  const modifier = styleModifiers[style] || styleModifiers.photorealistic;

  return `${basePrompt}, ${modifier}, product centered and prominent, well-lit`;
}

/**
 * Upscale image to higher resolution
 * @param {string} imageUrl - Image URL
 * @param {Object} options - Options
 * @param {string} apiKey - API key
 * @returns {Promise<Object>} - Result
 */
export async function upscaleImage(imageUrl, options = {}, apiKey) {
  // Security: Validate image URL
  if (!isValidImageUrl(imageUrl)) {
    throw new Error('Invalid or unauthorized image URL');
  }

  const {
    scale = 4,
    model = 'aurasr'
  } = options;

  const modelEndpoint = model === 'esrgan' ? MODELS.ESRGAN : MODELS.AURA_SR;

  const input = {
    image_url: imageUrl,
    upscaling_factor: scale
  };

  const result = await callFalApi(modelEndpoint, input, apiKey);

  return {
    imageUrl: result.image?.url || result.image,
    originalUrl: imageUrl,
    scale: scale
  };
}

/**
 * Generate image variations for A/B testing
 * @param {string} imageUrl - Image URL
 * @param {number} count - Number of variations
 * @param {Object} options - Options
 * @param {string} apiKey - API key
 * @returns {Promise<Object>} - Result with multiple images
 */
export async function generateVariations(imageUrl, count = 3, options = {}, apiKey) {
  // Security: Validate image URL
  if (!isValidImageUrl(imageUrl)) {
    throw new Error('Invalid or unauthorized image URL');
  }

  const {
    strength = 0.6,
    guidanceScale = 7.5
  } = options;

  const input = {
    image_url: imageUrl,
    num_images: count,
    strength: strength,
    guidance_scale: guidanceScale
  };

  const result = await callFalApi(MODELS.FLUX_REDUX, input, apiKey);

  const images = result.images || [result.image];

  return {
    images: images.map(img => img?.url || img),
    originalUrl: imageUrl,
    count: images.length
  };
}

/**
 * Create white background image (Amazon main image ready)
 * @param {string} imageUrl - Product image URL
 * @param {Object} options - Options
 * @param {string} apiKey - API key
 * @returns {Promise<Object>} - Result
 */
export async function createWhiteBackground(imageUrl, options = {}, apiKey) {
  // Security: Validate image URL
  if (!isValidImageUrl(imageUrl)) {
    throw new Error('Invalid or unauthorized image URL');
  }

  const {
    targetWidth = 3000,
    targetHeight = 3000,
    productFill = 0.85
  } = options;

  // Remove background with high quality
  const removed = await removeBackground(imageUrl, {
    model: 'birefnet',
    refineForeground: true,
    outputFormat: 'png'
  }, apiKey);

  // Replace with pure white
  const result = await replaceBackground(removed.imageUrl, {
    color: '#FFFFFF'
  }, apiKey);

  return {
    imageUrl: result.imageUrl,
    originalUrl: imageUrl,
    marketplace: 'amazon',
    requirements: {
      width: targetWidth,
      height: targetHeight,
      background: '#FFFFFF',
      productFill: productFill
    }
  };
}

/**
 * Optimize image for specific marketplace
 * @param {string} imageUrl - Image URL
 * @param {string} marketplace - 'etsy' or 'amazon'
 * @param {string} imageType - 'main' or 'lifestyle'
 * @param {string} apiKey - API key
 * @returns {Promise<Object>} - Optimized result
 */
export async function optimizeForMarketplace(imageUrl, marketplace, imageType, apiKey) {
  // Security: Validate image URL
  if (!isValidImageUrl(imageUrl)) {
    throw new Error('Invalid or unauthorized image URL');
  }

  const config = MARKETPLACE_CONFIG[marketplace];

  if (!config) {
    throw new Error(`Unsupported marketplace: ${marketplace}`);
  }

  if (marketplace === 'amazon' && imageType === 'main') {
    // Amazon main image needs pure white background
    return await createWhiteBackground(imageUrl, {
      targetWidth: config.mainImage.recommendedWidth,
      targetHeight: config.mainImage.recommendedHeight,
      productFill: config.mainImage.productFill
    }, apiKey);
  }

  // For Etsy or Amazon lifestyle images, upscale if needed
  const upscaled = await upscaleImage(imageUrl, { scale: 4 }, apiKey);

  return {
    imageUrl: upscaled.imageUrl,
    originalUrl: imageUrl,
    marketplace: marketplace,
    imageType: imageType
  };
}

/**
 * Process image with full pipeline
 * @param {string} imageUrl - Source image URL
 * @param {Object} options - Processing options
 * @param {string} apiKey - API key
 * @returns {Promise<Object>} - Processed result
 */
export async function processImage(imageUrl, options, apiKey) {
  // Security: Validate image URL
  if (!isValidImageUrl(imageUrl)) {
    throw new Error('Invalid or unauthorized image URL');
  }

  const {
    operation,
    marketplace = 'amazon',
    scenePrompt = null,
    style = 'photorealistic',
    variationCount = 3
  } = options;

  switch (operation) {
    case 'white_background':
      return await createWhiteBackground(imageUrl, {}, apiKey);

    case 'remove_background':
      return await removeBackground(imageUrl, {}, apiKey);

    case 'lifestyle':
      if (!scenePrompt) {
        throw new Error('Scene prompt required for lifestyle generation');
      }
      return await generateLifestyleImage(imageUrl, scenePrompt, { style }, apiKey);

    case 'upscale':
      return await upscaleImage(imageUrl, { scale: 4 }, apiKey);

    case 'variations':
      return await generateVariations(imageUrl, variationCount, {}, apiKey);

    case 'optimize':
      return await optimizeForMarketplace(imageUrl, marketplace, 'main', apiKey);

    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

/**
 * Convert image URL to base64
 * @param {string} url - Image URL
 * @returns {Promise<string>} - Base64 string
 */
export async function urlToBase64(url) {
  // Security: Validate URL
  if (!isValidImageUrl(url)) {
    throw new Error('Invalid or unauthorized image URL');
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Failed to fetch image');
  }

  const blob = await response.blob();

  // Validate that response is actually an image
  if (!blob.type.startsWith('image/')) {
    throw new Error('URL does not point to a valid image');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read image data'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert base64 to blob
 * @param {string} base64 - Base64 string
 * @returns {Blob} - Blob object
 */
export function base64ToBlob(base64) {
  // Security: Validate base64 format
  if (!base64 || typeof base64 !== 'string') {
    throw new Error('Invalid base64 input');
  }

  if (!base64.includes(';base64,')) {
    throw new Error('Invalid base64 data URL format');
  }

  try {
    const parts = base64.split(';base64,');
    if (parts.length !== 2) {
      throw new Error('Malformed base64 data URL');
    }

    const contentType = parts[0].split(':')[1];

    // Validate content type is an image
    if (!contentType || !contentType.startsWith('image/')) {
      throw new Error('Base64 data is not an image');
    }

    const raw = atob(parts[1]);
    const array = new Uint8Array(raw.length);

    for (let i = 0; i < raw.length; i++) {
      array[i] = raw.charCodeAt(i);
    }

    return new Blob([array], { type: contentType });
  } catch (error) {
    if (error.message.includes('Base64') || error.message.includes('base64') || error.message.includes('image')) {
      throw error;
    }
    throw new Error('Failed to decode base64 data');
  }
}

/**
 * Download image from URL
 * @param {string} url - Image URL
 * @param {string} filename - Download filename
 */
export async function downloadImage(url, filename) {
  // Security: Validate URL
  if (!isValidImageUrl(url)) {
    throw new Error('Invalid or unauthorized image URL');
  }

  // Sanitize filename to prevent path traversal
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Failed to download image');
  }

  const blob = await response.blob();

  // Validate response is an image
  if (!blob.type.startsWith('image/')) {
    throw new Error('Downloaded content is not an image');
  }

  const objectUrl = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = sanitizedFilename;
  a.click();

  URL.revokeObjectURL(objectUrl);
}

/**
 * Validate image for marketplace requirements
 * @param {Object} imageInfo - Image info (width, height, size)
 * @param {string} marketplace - Marketplace
 * @param {string} imageType - Image type
 * @returns {Object} - Validation result
 */
export function validateImage(imageInfo, marketplace, imageType = 'main') {
  const config = MARKETPLACE_CONFIG[marketplace];
  const issues = [];
  const warnings = [];

  if (!config) {
    return { valid: false, issues: ['Unknown marketplace'] };
  }

  const reqs = marketplace === 'amazon' && imageType === 'main'
    ? config.mainImage
    : config.imageRequirements;

  // Check dimensions
  if (imageInfo.width < reqs.minWidth) {
    issues.push(`Width too small (${imageInfo.width}px < ${reqs.minWidth}px minimum)`);
  } else if (imageInfo.width < reqs.recommendedWidth) {
    warnings.push(`Width below recommended (${imageInfo.width}px < ${reqs.recommendedWidth}px)`);
  }

  // Check file size
  if (imageInfo.size > reqs.maxFileSize) {
    issues.push(`File too large (${Math.round(imageInfo.size / 1024)}KB > ${Math.round(reqs.maxFileSize / 1024)}KB max)`);
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings,
    marketplace,
    imageType
  };
}

// Utility sleep function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Export models config for reference
export { MODELS, MARKETPLACE_CONFIG };
