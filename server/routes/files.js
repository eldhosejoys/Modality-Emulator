import { Router } from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', 'data');

const router = Router();

// DICOM data dictionary (common tags)
const TAG_DICTIONARY = {
  '00080005': 'Specific Character Set',
  '00080008': 'Image Type',
  '00080016': 'SOP Class UID',
  '00080018': 'SOP Instance UID',
  '00080020': 'Study Date',
  '00080021': 'Series Date',
  '00080022': 'Acquisition Date',
  '00080023': 'Content Date',
  '00080030': 'Study Time',
  '00080031': 'Series Time',
  '00080050': 'Accession Number',
  '00080060': 'Modality',
  '00080070': 'Manufacturer',
  '00080080': 'Institution Name',
  '00080090': 'Referring Physician Name',
  '00081030': 'Study Description',
  '0008103E': 'Series Description',
  '00100010': 'Patient Name',
  '00100020': 'Patient ID',
  '00100030': 'Patient Birth Date',
  '00100040': 'Patient Sex',
  '0020000D': 'Study Instance UID',
  '0020000E': 'Series Instance UID',
  '00280010': 'Rows',
  '00280011': 'Columns',
  '00400100': 'Scheduled Procedure Step Sequence',
};

// Multer setup for file uploads
function createUploader(subdir) {
  const dest = join(DATA_DIR, subdir);
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, dest),
    filename: (req, file, cb) => cb(null, file.originalname),
  });

  return multer({ storage });
}

const worklistUpload = createUploader('worklist');
const imagesUpload = createUploader('images');

// Helper: list files in a directory
function listFilesInDir(subdir) {
  const dir = join(DATA_DIR, subdir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.dcm') || f.endsWith('.DCM') || !f.startsWith('.'))
    .map((name) => {
      const stat = fs.statSync(join(dir, name));
      return {
        name,
        size: stat.size,
        modified: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Helper: parse a DICOM file and return tags recursively
async function parseDicomFile(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

    const dcmjs = await import('dcmjs');
    const { DicomMessage, DicomMetaDictionary } = dcmjs.data;

    let dicomDict;
    try {
      dicomDict = DicomMessage.readFile(arrayBuffer);
    } catch {
      dicomDict = DicomMessage.readFile(arrayBuffer, { ignoreErrors: true });
    }

    const dataset = DicomMetaDictionary.naturalizeDataset(dicomDict.dict);
    const metaDataset = dicomDict.meta ? DicomMetaDictionary.naturalizeDataset(dicomDict.meta) : {};
    const allData = { ...metaDataset, ...dataset };

    const flattenTags = (data, prefix = '') => {
      const result = [];
      for (const [keyword, value] of Object.entries(data)) {
        if (keyword.startsWith('_')) continue;

        const tagInfo = DicomMetaDictionary.nameMap?.[keyword];
        let tagStr = tagInfo?.tag || '';
        if (tagStr) {
          const clean = tagStr.replace(/[^0-9a-fA-F]/g, '').padStart(8, '0');
          tagStr = `(${clean.substring(0, 4)},${clean.substring(4, 8)})`.toUpperCase();
        }

        const vr = tagInfo?.vr || 'UN';
        const displayName = prefix ? `${prefix} > ${keyword}` : keyword;

        // Check for sequence or nested objects
        const isArrayOfObjects = Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && !(value[0] instanceof ArrayBuffer);
        const isObject = value !== null && typeof value === 'object' && !(value instanceof ArrayBuffer) && !Array.isArray(value);

        if (isArrayOfObjects) {
          result.push({
            tag: tagStr,
            name: displayName,
            vr: 'SQ',
            value: `[Sequence: ${value.length} item(s)]`,
            isHeader: true
          });
          value.forEach((item, index) => {
            result.push(...flattenTags(item, `${displayName} [${index}]`));
          });
        } else if (isObject) {
          // Handle nested objects that aren't arrays (like PN components if naturalized as object)
          result.push({
            tag: tagStr,
            name: displayName,
            vr: vr,
            value: `[Nested Data]`,
            isHeader: true
          });
          result.push(...flattenTags(value, displayName));
        } else {
          let displayValue = '';
          const isBinary = value instanceof ArrayBuffer || (value && value.buffer instanceof ArrayBuffer);

          if (value === null || value === undefined) {
            displayValue = '';
          } else if (isBinary) {
            // Convert binary to Hex string for small items, or show size
            const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
            if (bytes.length <= 8) {
              displayValue = Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('\\');
            } else {
              displayValue = `[Binary data: ${bytes.length} bytes]`;
            }
          } else if (Array.isArray(value)) {
            displayValue = value.join('\\');
          } else {
            displayValue = String(value);
          }

          if (displayValue.length > 300) {
            displayValue = displayValue.substring(0, 300) + '...';
          }

          result.push({
            tag: tagStr,
            name: displayName,
            vr,
            value: displayValue,
          });
        }
      }
      return result;
    };

    return flattenTags(allData);
  } catch (err) {
    console.error('Error parsing DICOM file:', err.message);
    return [{ tag: '', name: 'Parse Error', vr: '', value: err.message }];
  }
}

// GET /api/files/worklist
router.get('/worklist', (req, res) => {
  res.json(listFilesInDir('worklist'));
});

// GET /api/files/images
router.get('/images', (req, res) => {
  res.json(listFilesInDir('images'));
});

// POST /api/files/worklist (upload)
router.post('/worklist', worklistUpload.array('files', 50), (req, res) => {
  const uploaded = (req.files || []).map((f) => ({
    name: f.originalname,
    size: f.size,
    modified: new Date().toISOString(),
  }));
  res.json(uploaded);
});

// POST /api/files/images (upload)
router.post('/images', imagesUpload.array('files', 50), (req, res) => {
  const uploaded = (req.files || []).map((f) => ({
    name: f.originalname,
    size: f.size,
    modified: new Date().toISOString(),
  }));
  res.json(uploaded);
});

// DELETE /api/files/worklist/:filename
router.delete('/worklist/:filename', (req, res) => {
  const fp = join(DATA_DIR, 'worklist', req.params.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ success: false, error: 'File not found' });
  fs.unlinkSync(fp);
  res.json({ success: true });
});

// DELETE /api/files/images/:filename
router.delete('/images/:filename', (req, res) => {
  const fp = join(DATA_DIR, 'images', req.params.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ success: false, error: 'File not found' });
  fs.unlinkSync(fp);
  res.json({ success: true });
});

// GET /api/files/parse/:type/:filename
router.get('/parse/:type/:filename', async (req, res) => {
  const { type, filename } = req.params;
  if (!['worklist', 'images'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  const fp = join(DATA_DIR, type, filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File not found' });

  const tags = await parseDicomFile(fp);
  res.json(tags);
});

// GET /api/files/json/:type/:filename
router.get('/json/:type/:filename', async (req, res) => {
  const { type, filename } = req.params;
  if (!['worklist', 'images'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  const fp = join(DATA_DIR, type, filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File not found' });

  try {
    const buffer = fs.readFileSync(fp);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const dcmjs = await import('dcmjs');
    const { DicomMessage, DicomMetaDictionary } = dcmjs.data;

    let dicomDict;
    try {
      dicomDict = DicomMessage.readFile(arrayBuffer);
    } catch {
      dicomDict = DicomMessage.readFile(arrayBuffer, { ignoreErrors: true });
    }

    const dataset = DicomMetaDictionary.naturalizeDataset(dicomDict.dict);
    const cleanObject = (obj) => {
      if (Array.isArray(obj)) {
        obj.forEach(cleanObject);
      } else if (obj && typeof obj === 'object' && !(obj instanceof ArrayBuffer)) {
        delete obj._vrMap;
        delete obj._keyword;
        Object.values(obj).forEach(cleanObject);
      }
    };
    
    cleanObject(dataset);
    delete dataset.PixelData;
    res.json(dataset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
