/**
 * CORS Preflight Handler
 * Handles OPTIONS requests for CORS
 */

export const config = {
  runtime: 'edge'
};

export default function handler(req) {
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
