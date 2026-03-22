import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'path';
import type { Plugin } from 'vite';
import http from 'node:http';
import https from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Dev-only reverse proxy for Stream.
 *
 * Handles requests to /dev-proxy/<url> by forwarding them server-side,
 * bypassing browser CORS restrictions during development.
 *
 * The browser always sees a same-origin request to localhost:5173.
 * This proxy is stripped entirely from production builds.
 */
function devProxyPlugin(): Plugin {
  return {
    name: 'stream-dev-proxy',
    configureServer(server) {
      server.middlewares.use(
        '/dev-proxy/',
        (req: IncomingMessage, res: ServerResponse) => {
          // req.url arrives as "/<encoded-full-url>" — strip the leading /
          const encoded = req.url?.replace(/^\//, '') ?? '';

          let targetUrl: string;
          try {
            targetUrl = decodeURIComponent(encoded);
            new URL(targetUrl); // validate
          } catch {
            res.statusCode = 400;
            res.end('dev-proxy: invalid target URL');
            return;
          }

          const parsed    = new URL(targetUrl);
          const transport = parsed.protocol === 'https:' ? https : http;

          const proxyReq = transport.request(
            targetUrl,
            {
              method:  req.method,
              headers: {
                ...req.headers,
                host:    parsed.host,
                origin:  undefined,
                referer: undefined,
              },
            },
            (proxyRes) => {
              res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
              proxyRes.pipe(res);
            },
          );

          proxyReq.on('error', (err) => {
            res.statusCode = 502;
            res.end(`dev-proxy error: ${err.message}`);
          });

          req.pipe(proxyReq);
        },
      );
    },
  };
}

export default defineConfig({
  plugins: [preact(), devProxyPlugin()],
  root: __dirname,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      'stream-core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
});
