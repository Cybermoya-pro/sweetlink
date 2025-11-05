import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { issueSweetLinkHandshake } from './server/handshake';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const clientDir = path.resolve(__dirname, '../client');
app.use(express.static(clientDir));
app.post('/api/sweetlink/handshake', async (_req, res) => {
    try {
        const payload = await issueSweetLinkHandshake();
        res.json(payload);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console -- provide feedback for demo operators
        console.error('Failed to issue SweetLink handshake', message);
        res.status(500).json({ error: message });
    }
});
app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
});
const portRaw = process.env.PORT ?? process.env.SWEETLINK_APP_PORT ?? '4000';
const port = Number.isFinite(Number(portRaw)) ? Number(portRaw) : 4000;
app.listen(port, () => {
    // eslint-disable-next-line no-console -- provide feedback for demo operators
    console.log(`SweetLink demo available at http://localhost:${port}`);
    // eslint-disable-next-line no-console -- provide feedback for demo operators
    console.log(`POST http://localhost:${port}/api/sweetlink/handshake to request a session.`);
});
