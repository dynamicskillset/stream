/**
 * Stream CORS proxy — Netlify Function
 *
 * Forwards HTTP/HTTPS requests from the browser to the user's RSS backend,
 * bypassing browser CORS restrictions. Mirrors the Vite dev-proxy plugin.
 *
 * Usage: /.netlify/functions/proxy?url=<encodeURIComponent(targetUrl)>
 */

const HOP_BY_HOP = new Set([
  'host', 'origin', 'referer', 'connection',
  'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade',
]);

// Headers to forward from the proxy response back to the browser
const FORWARD_RESPONSE = ['content-type', 'link', 'x-reader-google-bad-token'];

interface NetlifyEvent {
  httpMethod: string;
  queryStringParameters?: Record<string, string> | null;
  headers: Record<string, string>;
  body?: string | null;
  isBase64Encoded?: boolean;
}

interface NetlifyResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

export const handler = async (event: NetlifyEvent): Promise<NetlifyResponse> => {
  const encoded = event.queryStringParameters?.url ?? '';

  let targetUrl: string;
  try {
    targetUrl = decodeURIComponent(encoded);
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only http/https');
    }
  } catch {
    return { statusCode: 400, body: 'proxy: invalid or missing ?url= parameter' };
  }

  // Forward request headers, stripping hop-by-hop and origin-sensitive ones
  const reqHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(event.headers)) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      reqHeaders[key] = value;
    }
  }
  reqHeaders['host'] = new URL(targetUrl).host;

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      method:  event.httpMethod,
      headers: reqHeaders,
      body:    event.body ?? undefined,
    });
  } catch (err) {
    return {
      statusCode: 502,
      body: `proxy: upstream error — ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const resHeaders: Record<string, string> = {
    'access-control-allow-origin': '*',
  };
  for (const name of FORWARD_RESPONSE) {
    const value = upstream.headers.get(name);
    if (value) resHeaders[name] = value;
  }

  return {
    statusCode: upstream.status,
    headers:    resHeaders,
    body:       await upstream.text(),
  };
};
