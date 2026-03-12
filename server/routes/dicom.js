import { Router } from 'express';
import net from 'net';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { readSettings } from './settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

// Helper: TCP ping
function tcpPing(host, port, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Connection timed out after ${timeout}ms`));
    }, timeout);

    socket.connect(port, host, () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// Helper: C-ECHO SCU using dcmjs-dimse
async function performEcho(host, port, callingAeTitle, calledAeTitle) {
  const dimseModule = await import('dcmjs-dimse');
  const dimse = dimseModule.default;
  const { Client } = dimse;
  const { CEchoRequest } = dimse.requests;

  return new Promise((resolve, reject) => {
    const client = new Client();
    const request = new CEchoRequest();

    client.on('associationAccepted', () => {
      client.sendRequests(request);
    });

    request.on('response', (response) => {
      const status = response.getStatus();
      if (status === 0x0000) {
        resolve({ success: true, message: 'C-ECHO successful (Status: 0x0000)' });
      } else {
        resolve({ success: false, message: `C-ECHO returned status: 0x${status.toString(16).padStart(4, '0').toUpperCase()}` });
      }
      client.release();
    });

    client.on('associationRejected', (result) => {
      reject(new Error(`Association rejected: ${JSON.stringify(result)}`));
    });

    client.on('networkError', (err) => {
      reject(err);
    });

    client.addRequest(request);
    client.send(host, port, callingAeTitle, calledAeTitle);
  });
}

// Helper: C-FIND SCU (Modality Worklist)
/**
 * Recursively removes keys with null values from a DICOM query object (including
 * nested sequences stored as arrays). This is critical because dcmjs-dimse coerces
 * null to a typed default (e.g., 0 for US fields like PatientPregnancyStatus 0010,21c0),
 * which Orthanc then treats as a value filter instead of a universal match — causing
 * 0 results even when the server has matching worklist entries.
 */
function stripNulls(obj) {
  if (Array.isArray(obj)) {
    return obj.map(stripNulls).filter(it => it !== undefined);
  }
  if (obj !== null && typeof obj === 'object') {
    const result = {};
    let hasKeys = false;
    for (const [key, value] of Object.entries(obj)) {
      if (value === null) continue;
      const stripped = stripNulls(value);
      if (stripped !== undefined) {
        result[key] = stripped;
        hasKeys = true;
      }
    }
    return hasKeys ? result : undefined;
  }
  return obj;
}

async function performWorklistQuery(host, port, callingAeTitle, calledAeTitle, query = {}) {
  const dimseModule = await import('dcmjs-dimse');
  const dimse = dimseModule.default;
  const { Client, Dataset, SopClass } = dimse;
  const { CFindRequest } = dimse.requests;

  return new Promise((resolve, reject) => {
    const client = new Client();
    const isRawTagQuery = Object.keys(query).some((k) => /^[0-9a-fA-F]{4},[0-9a-fA-F]{4}$/.test(k));

    console.log(`  🔍 Sending C-FIND Worklist Request to ${host}:${port} (${calledAeTitle})`);

    // Prepare the final query object
    let finalQuery;
    if (isRawTagQuery) {
      // 1. Raw Tag Path: Use exactly what the user provided, minus nulls
      finalQuery = stripNulls(query) || {};
    } else {
      // 2. Named Key Path.
      if (Object.keys(query).length === 0) {
        // Minimal template if starting from scratch
        finalQuery = {
          PatientName: '',
          PatientID: '',
          AccessionNumber: '',
          ScheduledProcedureStepSequence: [{
            Modality: '',
            ScheduledProcedureStepStartDate: '',
            ScheduledProcedureStepDescription: '',
            ScheduledProcedureStepID: '',
          }]
        };
      } else {
        finalQuery = { ...query };
        // Ensure PatientName/ID are present for UI rows, but only if they weren't explicitly filtered
        if (finalQuery.PatientName === undefined) finalQuery.PatientName = '';
        if (finalQuery.PatientID === undefined) finalQuery.PatientID = '';
      }
      finalQuery = stripNulls(finalQuery);
    }

    console.log(`  → Final Query Content:`, JSON.stringify(finalQuery, null, 2));

    // Manual request construction to bypass library templates
    const request = new CFindRequest();
    const mwlSopClass = SopClass ? SopClass.ModalityWorklistInformationModelFind : '1.2.840.10008.5.1.4.31';
    request.setAffectedSopClassUid(mwlSopClass);

    const dataset = new Dataset(finalQuery);
    
    /**
     * ANTI-INTRUSION FILTER:
     * Dcmjs-dimse often 'helpfully' injects tags like PatientPregnancyStatus (0010,21c0)="0"
     * into Worklist datasets. Orthanc uses "0" as a filter, breaking matching.
     * We manually strip any tag found in the final Dataset that WASN'T in finalQuery.
     */
    const elements = dataset.getElements();
    const userKeys = new Set(Object.keys(finalQuery));
    
    // Dictionary of tags the library likes to inject
    const intruders = {
      'PatientPregnancyStatus': '001021C0',
      'PatientBirthDate': '00100030',
      'PatientSex': '00100040',
      'MedicalAlerts': '00102000',
      'ContrastAllergies': '00102110',
      'SmokingStatus': '001021A0'
    };

    for (const [name, tagCode] of Object.entries(intruders)) {
      // If the user didn't ask for this tag (by name or by comma-hex), delete it from output
      const userAskedByName = userKeys.has(name);
      const userAskedByTag = userKeys.has(tagCode) || userKeys.has(`${tagCode.substring(0,4)},${tagCode.substring(4)}`);
      
      if (!userAskedByName && !userAskedByTag) {
        if (elements[name] !== undefined) delete elements[name];
        if (elements[tagCode] !== undefined) delete elements[tagCode];
      }
    }

    request.setDataset(dataset);
    const results = [];

    client.on('associationAccepted', () => {
      client.sendRequests(request);
    });

    request.on('response', (response) => {
      const status = response.getStatus();
      if (status === 0xff00 || status === 0xff01) {
        // Pending - more results coming
        const dataset = response.getDataset();
        if (dataset) {
          // In MWL, results are datasets. We'll return both a readable string
          // and the naturalized JSON for better UI handling and binding.
          const dcmString = dataset.toString();
          
          // Basic naturalization of the dataset object for the frontend
          const rawObj = dataset.getElements();
          const naturalized = {};
          
          // Minimal naturalization: map keywords to values
          for (const key in rawObj) {
            // Skip large elements and private tags if needed, but for MWL it's usually small
            if (rawObj[key] && typeof rawObj[key] !== 'function') {
              naturalized[key] = rawObj[key];
            }
          }

          results.push({
            string: dcmString,
            json: naturalized
          });
        }
      } else if (status === 0x0000) {
        // Success, no more results
        console.log(`  ✅ Worklist query success: Found ${results.length} results.`);
        resolve({
          success: true,
          message: `Worklist query completed. Found ${results.length} result(s).`,
          data: results,
        });
        client.release();
      } else {
        const statusHex = `0x${status.toString(16).padStart(4, '0').toUpperCase()}`;
        console.warn(`  ⚠️ Worklist query returned status: ${statusHex}`);
        resolve({
          success: false,
          message: `Worklist query returned status: ${statusHex}`,
        });
        client.release();
      }
    });

    client.on('associationRejected', (result) => {
      console.error('  ❌ Worklist association rejected:', result);
      reject(new Error(`Association rejected: ${JSON.stringify(result)}`));
    });

    client.on('networkError', (err) => {
      console.error('  ❌ Worklist network error:', err.message);
      reject(err);
    });

    client.addRequest(request);
    client.send(host, port, callingAeTitle, calledAeTitle);
  });
}

// Helper: C-STORE SCU
async function performStore(host, port, callingAeTitle, calledAeTitle, filePaths) {
  const dimseModule = await import('dcmjs-dimse');
  const dimse = dimseModule.default;
  const { Client } = dimse;
  const { CStoreRequest } = dimse.requests;

  return new Promise((resolve, reject) => {
    const client = new Client();
    let successCount = 0;
    let failCount = 0;
    let completedCount = 0;

    const requests = filePaths.map((fp) => {
      const request = new CStoreRequest(fp);
      request.on('response', (response) => {
        const status = response.getStatus();
        if (status === 0x0000) {
          successCount++;
        } else {
          failCount++;
        }
        completedCount++;
        
        if (completedCount === filePaths.length) {
          resolve({
            success: failCount === 0,
            message: `Store complete: ${successCount} succeeded, ${failCount} failed out of ${filePaths.length} file(s)`,
          });
          client.release();
        }
      });
      return request;
    });

    client.on('associationAccepted', () => {
      // Send the requests once association is established
      client.sendRequests(requests);
    });

    client.on('associationRejected', (result) => {
      reject(new Error(`Association rejected: ${JSON.stringify(result)}`));
    });

    client.on('networkError', (err) => {
      reject(err);
    });

    // Add requests to the client and initiate connection
    requests.forEach((req) => client.addRequest(req));
    client.send(host, port, callingAeTitle, calledAeTitle);
  });
}

// POST /api/dicom/ping
router.post('/ping', async (req, res) => {
  try {
    const { target } = req.body; // 'ris' or 'pacs'
    const settings = readSettings();
    const remote = settings[target];
    if (!remote) return res.status(400).json({ success: false, message: `Unknown target: ${target}` });

    await tcpPing(remote.ipAddress, remote.port);
    res.json({ success: true, message: `Successfully reached ${remote.ipAddress}:${remote.port}` });
  } catch (err) {
    res.json({ success: false, message: `Ping failed: ${err.message}` });
  }
});

// POST /api/dicom/echo
router.post('/echo', async (req, res) => {
  try {
    const { target } = req.body;
    const settings = readSettings();
    const remote = settings[target];
    if (!remote) return res.status(400).json({ success: false, message: `Unknown target: ${target}` });

    const result = await performEcho(remote.ipAddress, remote.port, settings.emulator.aeTitle, remote.aeTitle);
    res.json(result);
  } catch (err) {
    res.json({ success: false, message: `DICOM Echo failed: ${err.message}` });
  }
});

// POST /api/dicom/worklist
router.post('/worklist', async (req, res) => {
  try {
    const settings = readSettings();
    const ris = settings.ris;
    const query = req.body || {};
    const result = await performWorklistQuery(ris.ipAddress, ris.port, settings.emulator.aeTitle, ris.aeTitle, query);
    res.json(result);
  } catch (err) {
    res.json({ success: false, message: `Worklist query failed: ${err.message}` });
  }
});

// Helper: Update DICOM tags using dcmjs
async function updateDicomTags(filePath, worklistData, outputPath) {
  const dcmjs = await import('dcmjs');
  const { DicomMessage, DicomMetaDictionary } = dcmjs.data;
  
  const buffer = fs.readFileSync(filePath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  
  let dicomDict;
  try {
    dicomDict = DicomMessage.readFile(arrayBuffer);
  } catch {
    dicomDict = DicomMessage.readFile(arrayBuffer, { ignoreErrors: true });
  }

  const dataset = DicomMetaDictionary.naturalizeDataset(dicomDict.dict);
  
  // Bind worklist data to image dataset
  // We prioritize data from the worklist
  const tagsToBind = {
    'PatientName': worklistData.PatientName,
    'PatientID': worklistData.PatientID,
    'PatientBirthDate': worklistData.PatientBirthDate,
    'PatientSex': worklistData.PatientSex,
    'AccessionNumber': worklistData.AccessionNumber,
    'StudyInstanceUID': worklistData.StudyInstanceUID,
    'ReferringPhysicianName': worklistData.ReferringPhysicianName,
    'StudyDescription': worklistData.ScheduledProcedureStepSequence?.[0]?.ScheduledProcedureStepDescription || worklistData.StudyDescription,
  };

  for (const [key, value] of Object.entries(tagsToBind)) {
    if (value !== undefined && value !== null) {
      dataset[key] = value;
    }
  }

  // Denaturalize back to DICOM format
  const denaturalized = DicomMetaDictionary.denaturalizeDataset(dataset);
  dicomDict.dict = denaturalized;
  
  // Write back to a new buffer
  const newBuffer = Buffer.from(dicomDict.write());
  fs.writeFileSync(outputPath, newBuffer);
}

// POST /api/dicom/store
router.post('/store', async (req, res) => {
  let tempFiles = [];
  try {
    const { filenames, worklistData } = req.body;
    if (!filenames || !filenames.length) {
      return res.status(400).json({ success: false, message: 'No files specified' });
    }

    const settings = readSettings();
    const pacs = settings.pacs;
    const imagesDir = join(__dirname, '..', 'data', 'images');
    const tmpDir = join(__dirname, '..', 'data', 'tmp');
    
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    let filePathsToStore = filenames.map((name) => join(imagesDir, name));

    // If worklist data is provided, update images first
    if (worklistData) {
      console.log(`  🔄 Binding worklist data to ${filenames.length} image(s) before storage`);
      const updatedPaths = [];
      for (const name of filenames) {
        const srcPath = join(imagesDir, name);
        if (!fs.existsSync(srcPath)) continue;
        
        const tmpPath = join(tmpDir, `bound_${Date.now()}_${name}`);
        await updateDicomTags(srcPath, worklistData, tmpPath);
        updatedPaths.push(tmpPath);
        tempFiles.push(tmpPath);
      }
      filePathsToStore = updatedPaths;
    }

    // Verify all files exist
    for (const fp of filePathsToStore) {
      if (!fs.existsSync(fp)) {
        return res.status(400).json({ success: false, message: `File not found: ${fp}` });
      }
    }

    const result = await performStore(pacs.ipAddress, pacs.port, settings.emulator.aeTitle, pacs.aeTitle, filePathsToStore);
    res.json(result);
  } catch (err) {
    console.error('Store error:', err);
    res.json({ success: false, message: `Store failed: ${err.message}` });
  } finally {
    // Clean up temp files
    for (const fp of tempFiles) {
      try {
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      } catch (e) {
        console.error(`Failed to delete temp file ${fp}:`, e.message);
      }
    }
  }
});

export default router;
