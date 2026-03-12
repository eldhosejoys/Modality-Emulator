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
  '00080064': 'Conversion Type',
  '00080070': 'Manufacturer',
  '00080080': 'Institution Name',
  '00080090': 'Referring Physician Name',
  '00081030': 'Study Description',
  '0008103E': 'Series Description',
  '00081110': 'Referenced Study Sequence',
  '00081150': 'Referenced SOP Class UID',
  '00081155': 'Referenced SOP Instance UID',
  '00100010': 'Patient Name',
  '00100020': 'Patient ID',
  '00100021': 'Issuer of Patient ID',
  '00100030': 'Patient Birth Date',
  '00100040': 'Patient Sex',
  '00101000': 'Other Patient IDs',
  '00101020': 'Patient Size',
  '00101030': 'Patient Weight',
  '0020000D': 'Study Instance UID',
  '0020000E': 'Series Instance UID',
  '00200010': 'Study ID',
  '00200011': 'Series Number',
  '00200013': 'Instance Number',
  '00200020': 'Patient Orientation',
  '00280002': 'Samples per Pixel',
  '00280004': 'Photometric Interpretation',
  '00280010': 'Rows',
  '00280011': 'Columns',
  '00280030': 'Pixel Spacing',
  '00280100': 'Bits Allocated',
  '00280101': 'Bits Stored',
  '00280102': 'High Bit',
  '00280103': 'Pixel Representation',
  '00321032': 'Requesting Physician',
  '00321060': 'Requested Procedure Description',
  '00380010': 'Admission ID',
  '00400001': 'Scheduled Station AE Title',
  '00400002': 'Scheduled Procedure Step Start Date',
  '00400003': 'Scheduled Procedure Step Start Time',
  '00400006': 'Scheduled Performing Physician Name',
  '00400007': 'Scheduled Procedure Step Description',
  '00400009': 'Scheduled Procedure Step ID',
  '00400100': 'Scheduled Procedure Step Sequence',
  '00401001': 'Requested Procedure ID',
  '7FE00010': 'Pixel Data',
};

// VR name mapping
const VR_NAMES = {
  AE: 'AE', AS: 'AS', AT: 'AT', CS: 'CS', DA: 'DA', DS: 'DS',
  DT: 'DT', FL: 'FL', FD: 'FD', IS: 'IS', LO: 'LO', LT: 'LT',
  OB: 'OB', OD: 'OD', OF: 'OF', OW: 'OW', PN: 'PN', SH: 'SH',
  SL: 'SL', SQ: 'SQ', SS: 'SS', ST: 'ST', TM: 'TM', UC: 'UC',
  UI: 'UI', UL: 'UL', UN: 'UN', UR: 'UR', US: 'US', UT: 'UT',
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

// Helper: parse a DICOM file and return tags
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
      // Try reading as raw dataset (no preamble/meta)
      dicomDict = DicomMessage.readFile(arrayBuffer, { ignoreErrors: true });
    }

    const dataset = DicomMetaDictionary.naturalizeDataset(dicomDict.dict);
    const metaDataset = dicomDict.meta ? DicomMetaDictionary.naturalizeDataset(dicomDict.meta) : {};

    const tags = [];
    const allData = { ...metaDataset, ...dataset };

    for (const [keyword, value] of Object.entries(allData)) {
      if (keyword.startsWith('_')) continue;

      // Try to find the tag number
      const tagInfo = DicomMetaDictionary.nameMap?.[keyword];
      let tagStr = tagInfo?.tag || '';
      if (tagStr) {
        // Format as (XXXX,YYYY)
        const clean = tagStr.replace(/[^0-9a-fA-F]/g, '').padStart(8, '0');
        tagStr = `(${clean.substring(0, 4)},${clean.substring(4, 8)})`.toUpperCase();
      }

      const vr = tagInfo?.vr || 'UN';
      let displayValue = '';

      if (value === null || value === undefined) {
        displayValue = '';
      } else if (typeof value === 'object' && value instanceof ArrayBuffer) {
        displayValue = `[Binary data: ${value.byteLength} bytes]`;
      } else if (Array.isArray(value)) {
        if (value.length > 0 && typeof value[0] === 'object') {
          displayValue = `[Sequence: ${value.length} item(s)]`;
        } else {
          displayValue = value.join('\\');
        }
      } else if (typeof value === 'object') {
        displayValue = JSON.stringify(value);
      } else {
        displayValue = String(value);
      }

      // Truncate very long values
      if (displayValue.length > 200) {
        displayValue = displayValue.substring(0, 200) + '...';
      }

      tags.push({
        tag: tagStr,
        name: keyword,
        vr,
        value: displayValue,
      });
    }

    // Sort by tag
    tags.sort((a, b) => a.tag.localeCompare(b.tag));
    return tags;
  } catch (err) {
    console.error('Error parsing DICOM file:', err.message);
    // Return basic file info if parsing fails
    return [{
      tag: '',
      name: 'Parse Error',
      vr: '',
      value: err.message,
    }];
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
  if (!['worklist', 'images'].includes(type)) {
    return res.status(400).json({ error: 'Invalid type' });
  }
  const fp = join(DATA_DIR, type, filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File not found' });

  const tags = await parseDicomFile(fp);
  res.json(tags);
});

export default router;
