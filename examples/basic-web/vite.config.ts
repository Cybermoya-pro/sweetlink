import type { ServerResponse } from 'node:http';
import { defineConfig, type PluginOption } from 'vite';
import { issueSweetLinkHandshake } from './server/handshake.js';

async function handleHandshakeRequest(_req: unknown, res: ServerResponse) {
  try {
    const payload = await issueSweetLinkHandshake();
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: message }));
  }
}

function sweetLinkHandshakePlugin(): PluginOption {
  return {
    name: 'sweetlink-handshake',
    configureServer(server) {
      server.middlewares.use('/api/sweetlink/handshake', (req, res, next) => {
        if (req.method !== 'POST') {
          return next();
        }
        void handleHandshakeRequest(req, res);
        return undefined;
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/sweetlink/handshake', (req, res, next) => {
        if (req.method !== 'POST') {
          return next();
        }
        void handleHandshakeRequest(req, res);
        return undefined;
      });
    },
  };
}

export default defineConfig({
  server: {
    port: 4000,
    strictPort: true,
  },
  preview: {
    port: 4000,
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  plugins: [sweetLinkHandshakePlugin()],
});
