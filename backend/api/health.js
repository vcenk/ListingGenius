/**
 * Health Check Endpoint
 * ListingGenius Backend
 */

export const config = {
  runtime: 'edge'
};

export default function handler(req) {
  return new Response(JSON.stringify({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
