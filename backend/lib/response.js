/**
 * Response Utilities
 * ListingGenius Backend
 */

/**
 * Create a JSON response
 * @param {Object} data - Response data
 * @param {number} status - HTTP status code
 * @param {Object} headers - Additional headers
 * @returns {Response} - Response object
 */
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Extension-Id',
      ...headers
    }
  });
}

/**
 * Create an error response
 * @param {string} message - Error message
 * @param {number} status - HTTP status code
 * @param {string} code - Error code
 * @returns {Response} - Response object
 */
export function error(message, status = 400, code = 'ERROR') {
  return json({ error: message, code }, status);
}

/**
 * Create a success response
 * @param {Object} data - Response data
 * @param {Object} meta - Metadata (usage, etc.)
 * @returns {Response} - Response object
 */
export function success(data, meta = {}) {
  return json({ success: true, data, ...meta });
}

/**
 * Handle CORS preflight
 * @returns {Response} - CORS response
 */
export function cors() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Extension-Id',
      'Access-Control-Max-Age': '86400'
    }
  });
}

/**
 * Sanitize error message for client
 * Remove sensitive information from error messages
 * @param {Error|string} err - Error object or message
 * @returns {string} - Sanitized message
 */
export function sanitizeError(err) {
  const message = typeof err === 'string' ? err : err.message || 'An error occurred';

  // Remove API keys and sensitive data
  return message
    .replace(/sk-[a-zA-Z0-9]+/g, '[API_KEY]')
    .replace(/key[=:]\s*['"]?[a-zA-Z0-9_-]+['"]?/gi, 'key=[REDACTED]')
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/https?:\/\/[^\s]+token=[^\s&]+/gi, '[URL_REDACTED]');
}
