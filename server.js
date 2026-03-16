import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setupAPI } from './server/api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));


const app = express();

// JSON body parsing for POST/PUT routes
app.use(express.json({ limit: '10mb' }));

// API routes
setupAPI(app);

// Serve built static files
app.use(express.static(join(__dirname, 'dist')));

// SPA fallback — serve index.html for all non-API routes
app.get('/{*splat}', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LyricMachine running on http://localhost:${PORT}`);
});
