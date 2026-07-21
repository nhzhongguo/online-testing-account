import { defineConfig } from 'vitest/config';
import type { Plugin, ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateCredential } = require('./electron/credential-validator.cjs') as {
  validateCredential: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
};
const { checkNetworkRegion } = require('./electron/network-check.cjs') as {
  checkNetworkRegion: () => Promise<Record<string, unknown>>;
};

function localValidationPlugin(): Plugin {
  return {
    name: 'account-pulse-local-validation',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/__account-pulse/network-check', async (request, response, next) => {
        if (request.method !== 'GET') {
          next();
          return;
        }
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify(await checkNetworkRegion()));
      });
      server.middlewares.use('/__account-pulse/validate', (request, response, next) => {
        if (request.method !== 'POST') {
          next();
          return;
        }

        let body = '';
        request.setEncoding('utf8');
        request.on('data', (chunk: string) => {
          body += chunk;
          if (body.length > 64 * 1024) request.destroy();
        });
        request.on('end', async () => {
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          try {
            const result = await validateCredential(JSON.parse(body));
            response.statusCode = 200;
            response.end(JSON.stringify(result));
          } catch {
            response.statusCode = 400;
            response.end(JSON.stringify({ status: 'server_error', detail: '验证请求格式错误' }));
          }
        });
      });
    },
  };
}

function devContentSecurityPolicyPlugin(): Plugin {
  return {
    name: 'account-pulse-dev-csp',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        if (!context.server) return html;
        return html.replace(
          /style-src 'self'/,
          "style-src 'self' 'unsafe-inline'",
        );
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), localValidationPlugin(), devContentSecurityPolicyPlugin()],
  test: {
    exclude: ['**/node_modules/**', 'scripts/**/*.test.mjs'],
  },
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
});
