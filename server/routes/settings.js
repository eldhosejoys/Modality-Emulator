import { Router } from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SETTINGS_PATH = join(__dirname, '..', 'data', 'settings.json');

const router = Router();

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch {
    return {
      emulator: { systemName: 'Modality', aeTitle: 'MODALITY', listenPort: 104 },
      ris: { ipAddress: '127.0.0.1', port: 4242, aeTitle: 'ORTHANC' },
      pacs: { ipAddress: '127.0.0.1', port: 4242, aeTitle: 'ORTHANC' },
    };
  }
}

function writeSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

// GET /api/settings
router.get('/', (req, res) => {
  res.json(readSettings());
});

// PUT /api/settings
router.put('/', (req, res) => {
  const settings = req.body;
  writeSettings(settings);
  res.json(settings);
});

export default router;
export { readSettings };
