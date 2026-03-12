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
async function performWorklistQuery(host, port, callingAeTitle, calledAeTitle, query = {}) {
  const dimseModule = await import('dcmjs-dimse');
  const dimse = dimseModule.default;
  const { Client } = dimse;
  const { CFindRequest } = dimse.requests;

  return new Promise((resolve, reject) => {
    const client = new Client();
    
    // Build the query dataset based on provided params or defaults
    const queryParams = {
      PatientName: query.PatientName || '*',
      PatientID: query.PatientID || '',
      AccessionNumber: query.AccessionNumber || '',
      ScheduledProcedureStepSequence: [
        {
          Modality: query.Modality || '',
          ScheduledProcedureStepStartDate: query.ScheduledProcedureStepStartDate || '',
          ScheduledPerformingPhysicianName: query.ScheduledPerformingPhysicianName || '',
        },
      ],
      ...query
    };

    const request = CFindRequest.createWorklistFindRequest(queryParams);

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
          results.push(dataset.toString());
        }
      } else if (status === 0x0000) {
        // Success, no more results
        resolve({
          success: true,
          message: `Worklist query completed. Found ${results.length} result(s).`,
          data: results,
        });
        client.release();
      } else {
        resolve({
          success: false,
          message: `Worklist query returned status: 0x${status.toString(16).padStart(4, '0').toUpperCase()}`,
        });
        client.release();
      }
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

    client.on('associationAccepted', () => {
      const requests = filePaths.map((fp) => new CStoreRequest(fp));
      requests.forEach((req) => {
        req.on('response', (response) => {
          const status = response.getStatus();
          if (status === 0x0000) {
            successCount++;
          } else {
            failCount++;
          }
        });
      });
      client.sendRequests(requests);
    });

    client.on('cStoreComplete', () => {
      resolve({
        success: failCount === 0,
        message: `Store complete: ${successCount} succeeded, ${failCount} failed out of ${filePaths.length} file(s)`,
      });
      client.release();
    });

    client.on('associationRejected', (result) => {
      reject(new Error(`Association rejected: ${JSON.stringify(result)}`));
    });

    client.on('networkError', (err) => {
      reject(err);
    });

    filePaths.forEach((fp) => {
      client.addRequest(new CStoreRequest(fp));
    });
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

// POST /api/dicom/store
router.post('/store', async (req, res) => {
  try {
    const { filenames } = req.body;
    if (!filenames || !filenames.length) {
      return res.status(400).json({ success: false, message: 'No files specified' });
    }

    const settings = readSettings();
    const pacs = settings.pacs;
    const imagesDir = join(__dirname, '..', 'data', 'images');

    const filePaths = filenames.map((name) => join(imagesDir, name));

    // Verify all files exist
    for (const fp of filePaths) {
      if (!fs.existsSync(fp)) {
        return res.status(400).json({ success: false, message: `File not found: ${fp}` });
      }
    }

    const result = await performStore(pacs.ipAddress, pacs.port, settings.emulator.aeTitle, pacs.aeTitle, filePaths);
    res.json(result);
  } catch (err) {
    res.json({ success: false, message: `Store failed: ${err.message}` });
  }
});

export default router;
