import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import settingsRouter from './routes/settings.js';
import dicomRouter from './routes/dicom.js';
import emulatorRouter from './routes/emulator.js';
import filesRouter from './routes/files.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 5050;

// Ensure data directories exist
const dataDir = join(__dirname, 'data');
const worklistDir = join(dataDir, 'worklist');
const imagesDir = join(dataDir, 'images');

[dataDir, worklistDir, imagesDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/settings', settingsRouter);
app.use('/api/dicom', dicomRouter);
app.use('/api/emulator', emulatorRouter);
app.use('/api/files', filesRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`\n  🏥 Modality Emulator Backend`);
  console.log(`  → Running on http://localhost:${PORT}`);
  console.log(`  → Data directory: ${dataDir}\n`);
});
