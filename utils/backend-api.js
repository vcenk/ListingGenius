/**
 * Backend API Client
 * ListingGenius Extension
 *
 * Communicates with the secure Vercel backend
 * All API keys are stored server-side
 */

// Backend URL - Change this to your Vercel deployment URL
const BACKEND_URL = 'https://your-project.vercel.app';

// For local development, use:
// const BACKEND_URL = 'http://localhost:3000';

// Storage keys
const TOKEN_KEY = 'lg_auth_token';
const DEVICE_ID_KEY = 'lg_device_id';

/**
 * Generate or retrieve device ID
 * @returns {Promise<string>} Device ID
 */
async function getDeviceId() {
  const stored = await chrome.storage.local.get(DEVICE_ID_KEY);

  if (stored[DEVICE_ID_KEY]) {
    return stored[DEVICE_ID_KEY];
  }

  // Generate new device ID
  const deviceId = crypto.randomUUID();
  await chrome.storage.local.set({ [DEVICE_ID_KEY]: deviceId });
  return deviceId;
}

/**
 * Get stored auth token
 * @returns {Promise<string|null>} JWT token
 */
async function getToken() {
  const stored = await chrome.storage.local.get(TOKEN_KEY);
  return stored[TOKEN_KEY] || null;
}

/**
 * Store auth token
 * @param {string} token - JWT token
 */
async function setToken(token) {
  await chrome.storage.local.set({ [TOKEN_KEY]: token });
}

/**
 * Make authenticated request to backend
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} Response data
 */
async function apiRequest(endpoint, options = {}) {
  const token = await getToken();
  const extensionId = chrome.runtime.id;

  const headers = {
    'Content-Type': 'application/json',
    'X-Extension-Id': extensionId,
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers
  };

  const response = await fetch(`${BACKEND_URL}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json();

  if (!response.ok) {
    // Handle specific error cases
    if (response.status === 401) {
      // Token expired, try to re-authenticate
      await authenticate();
      // Retry the request once
      return apiRequest(endpoint, options);
    }

    throw new Error(data.error || `API error: ${response.status}`);
  }

  return data;
}

/**
 * Authenticate with backend
 * @returns {Promise<Object>} User data
 */
export async function authenticate() {
  const deviceId = await getDeviceId();

  const response = await fetch(`${BACKEND_URL}/api/user?action=login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Extension-Id': chrome.runtime.id
    },
    body: JSON.stringify({ deviceId })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Authentication failed');
  }

  if (data.data?.token) {
    await setToken(data.data.token);
  }

  return data.data;
}

/**
 * Get user info and limits
 * @returns {Promise<Object>} User info
 */
export async function getUserInfo() {
  return apiRequest('/api/user?action=info');
}

/**
 * Get usage statistics
 * @returns {Promise<Object>} Usage stats
 */
export async function getUsage() {
  return apiRequest('/api/user?action=usage');
}

/**
 * Call OpenAI chat completion via backend
 * @param {string} prompt - The prompt
 * @param {Object} options - Options (model, temperature, etc.)
 * @returns {Promise<string>} Response content
 */
export async function callOpenAI(prompt, options = {}) {
  const response = await apiRequest('/api/openai/chat', {
    method: 'POST',
    body: JSON.stringify({
      prompt,
      model: options.model || 'gpt-4o-mini',
      temperature: options.temperature || 0.7,
      maxTokens: options.maxTokens || 1000,
      responseFormat: options.responseFormat
    })
  });

  return response.data?.content;
}

/**
 * Analyze image via backend
 * @param {string} imageUrl - Image URL
 * @param {string} prompt - Analysis prompt
 * @returns {Promise<string>} Analysis result
 */
export async function analyzeImage(imageUrl, prompt) {
  const response = await apiRequest('/api/openai/vision', {
    method: 'POST',
    body: JSON.stringify({ imageUrl, prompt })
  });

  return response.data?.content;
}

/**
 * Get keyword data via backend
 * @param {string[]} keywords - Keywords to analyze
 * @param {Object} options - Options (country, currency)
 * @returns {Promise<Object>} Keyword data
 */
export async function getKeywordData(keywords, options = {}) {
  const response = await apiRequest('/api/keywords/search', {
    method: 'POST',
    body: JSON.stringify({
      keywords,
      country: options.country || 'us',
      currency: options.currency || 'USD'
    })
  });

  return response.data;
}

/**
 * Process image via backend (fal.ai)
 * @param {string} imageUrl - Image URL
 * @param {string} operation - Operation type
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processing result
 */
export async function processImage(imageUrl, operation, options = {}) {
  const response = await apiRequest('/api/fal/process', {
    method: 'POST',
    body: JSON.stringify({
      imageUrl,
      operation,
      options
    })
  });

  return response.data;
}

/**
 * Remove background from image
 * @param {string} imageUrl - Image URL
 * @param {Object} options - Options
 * @returns {Promise<Object>} Result
 */
export async function removeBackground(imageUrl, options = {}) {
  return processImage(imageUrl, 'remove_background', options);
}

/**
 * Create white background (Amazon-ready)
 * @param {string} imageUrl - Image URL
 * @param {Object} options - Options
 * @returns {Promise<Object>} Result
 */
export async function createWhiteBackground(imageUrl, options = {}) {
  return processImage(imageUrl, 'white_background', options);
}

/**
 * Generate lifestyle image
 * @param {string} imageUrl - Product image URL
 * @param {string} prompt - Scene description
 * @param {Object} options - Options
 * @returns {Promise<Object>} Result
 */
export async function generateLifestyleImage(imageUrl, prompt, options = {}) {
  return processImage(imageUrl, 'lifestyle', { ...options, prompt });
}

/**
 * Upscale image
 * @param {string} imageUrl - Image URL
 * @param {Object} options - Options (scale, model)
 * @returns {Promise<Object>} Result
 */
export async function upscaleImage(imageUrl, options = {}) {
  return processImage(imageUrl, 'upscale', options);
}

/**
 * Generate image variations
 * @param {string} imageUrl - Image URL
 * @param {Object} options - Options (count, strength)
 * @returns {Promise<Object>} Result
 */
export async function generateVariations(imageUrl, options = {}) {
  return processImage(imageUrl, 'variations', options);
}

/**
 * Check backend health
 * @returns {Promise<Object>} Health status
 */
export async function checkHealth() {
  const response = await fetch(`${BACKEND_URL}/api/health`);
  return response.json();
}

/**
 * Initialize backend connection
 * Call this on extension startup
 * @returns {Promise<Object>} Auth result
 */
export async function initBackend() {
  try {
    // Check if backend is available
    await checkHealth();

    // Authenticate
    return await authenticate();
  } catch (error) {
    console.error('Backend initialization failed:', error);
    throw error;
  }
}

// Export backend URL for configuration
export { BACKEND_URL };
