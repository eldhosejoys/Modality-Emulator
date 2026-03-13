import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { Router } from 'express';
import { readSettings } from './settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const IMAGES_DIR = join(__dirname, '..', 'data', 'images');

const router = Router();

// In-memory emulator state
let scpServer = null;
let isRunning = false;
let currentPort = null;
let currentAeTitle = null;
let scpLogs = [];

function addScpLog(message, type = 'info') {
  const logEntry = {
    id: `server-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    message,
    type,
    isExternal: true // Flag to distinguish server-originated logs
  };
  scpLogs.push(logEntry);
  if (scpLogs.length > 100) scpLogs.shift();
  return logEntry;
}

// Helper: Get all image datasets and paths from local storage
async function getStoredImages() {
  if (!fs.existsSync(IMAGES_DIR)) return [];
  
  const dcmjs = await import('dcmjs');
  const { DicomMessage, DicomMetaDictionary } = dcmjs.data;
  const results = [];
  
  const files = fs.readdirSync(IMAGES_DIR).filter(f => f.toLowerCase().endsWith('.dcm'));
  
  for (const file of files) {
    try {
      const filePath = join(IMAGES_DIR, file);
      const buffer = fs.readFileSync(filePath);
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      const dicomDict = DicomMessage.readFile(arrayBuffer, { ignoreErrors: true });
      const dataset = DicomMetaDictionary.naturalizeDataset(dicomDict.dict);
      
      results.push({ dataset, filePath });
    } catch (e) {
      console.warn(`Failed to parse ${file}:`, e.message);
    }
  }
  return results;
}

// Helper: Get all image datasets from local storage
async function getStoredImagesDatasets() {
  const images = await getStoredImages();
  return images.map(img => img.dataset);
}

// Helper: Internal function to perform C-STORE (SCU) for C-MOVE sub-operations
async function internalStore(host, port, callingAeTitle, calledAeTitle, filePaths) {
  const dimseModule = await import('dcmjs-dimse');
  const dimse = dimseModule.default;
  const { Client } = dimse;
  const { CStoreRequest } = dimse.requests;

  return new Promise((resolve) => {
    const client = new Client();
    let completed = 0;
    let failed = 0;
    let finished = 0;

    if (filePaths.length === 0) {
      resolve({ completed: 0, failed: 0 });
      return;
    }

    const requests = filePaths.map((fp) => {
      const request = new CStoreRequest(fp);
      request.on('response', (response) => {
        const status = response.getStatus();
        if (status === 0x0000) completed++;
        else failed++;
        
        finished++;
        if (finished === filePaths.length) {
          client.release();
          resolve({ completed, failed });
        }
      });
      return request;
    });

    client.on('networkError', (err) => {
      console.error('Internal store network error:', err.message);
      resolve({ completed, failed: filePaths.length - finished });
    });

    requests.forEach((req) => client.addRequest(req));
    client.send(host, port, callingAeTitle, calledAeTitle);
  });
}

// Helper: Basic DICOM matching logic
function matchesQuery(query, record) {
  // DICOM Matching rules: 
  // - Empty strings or empty arrays in query match everything (universal match)
  // - * or ? are wildcards
  // - Otherwise exact match
  
  const tagsToIgnore = ['QueryRetrieveLevel', 'SpecificCharacterSet', 'Priority', '_vrMap'];

  // Inner helper to get a comparable string from DICOM values (handles Alphabetic objects, etc.)
  function toFlatString(val) {
    if (val === null || val === undefined) return '';
    if (Array.isArray(val)) {
      if (val.length === 0) return '';
      return toFlatString(val[0]);
    }
    if (typeof val === 'object') {
      // Common DICOM naturalized object structure for names
      return toFlatString(val.Alphabetic || val.Ideographic || val.Phonetic || '');
    }
    return String(val);
  }

  for (const key in query) {
    if (key.startsWith('_') || tagsToIgnore.includes(key)) continue;
    
    let qVal = query[key];
    let rVal = record[key];
    
    // Check for universal match: null, undefined, '', '*', or empty array []
    const isUniversalMatch = (
      qVal === null || 
      qVal === undefined || 
      qVal === '' || 
      qVal === '*' || 
      (Array.isArray(qVal) && qVal.length === 0)
    );

    if (isUniversalMatch) continue;
    
    // If record doesn't have the field but query asks for a specific value, it's NOT a match
    if (rVal === undefined || rVal === null) return false;
    
    const qStr = toFlatString(qVal).toLowerCase();
    const rStr = toFlatString(rVal).toLowerCase();
    
    // Wildcard matching (simple version)
    if (qStr.includes('*')) {
      const parts = qStr.split('*').filter(p => p !== '');
      if (parts.length === 0) continue; // Just 1 or more * fits anything
      
      // Check if all parts exist in sequence
      let lastIndex = 0;
      let allPartsMatch = true;
      for (const part of parts) {
        const foundIndex = rStr.indexOf(part, lastIndex);
        if (foundIndex === -1) {
          allPartsMatch = false;
          break;
        }
        lastIndex = foundIndex + part.length;
      }
      if (!allPartsMatch) return false;
    } else {
      // Exact match
      if (qStr !== rStr) return false;
    }
  }
  return true;
}

// POST /api/emulator/start
router.post('/start', async (req, res) => {
  if (isRunning) {
    return res.json({ running: true, port: currentPort, aeTitle: currentAeTitle });
  }

  try {
    const settings = readSettings();
    const { listenPort, aeTitle } = settings.emulator;

    const dimseModule = await import('dcmjs-dimse');
    const dimse = dimseModule.default;
    const { Server, Dataset } = dimse;
    const { CEchoResponse, CFindResponse, CMoveResponse } = dimse.responses;

    class ModalityScp extends dimse.Scp {
      constructor(socket, opts) {
        super(socket, opts);
        this.socket = socket;
        this.association = undefined;
      }

      associationRequested(association) {
        this.association = association;
        const remoteIp = this.socket ? this.socket.remoteAddress : 'unknown';
        const callingAet = association.getCallingAeTitle();
        
        addScpLog(`Inbound association from ${remoteIp} (Calling AE: ${callingAet})`, 'info');

        const contexts = association.getPresentationContexts();
        contexts.forEach((c) => {
          const context = association.getPresentationContext(c.id);
          const abstractSyntax = context.getAbstractSyntaxUid();
          
          const allowedSyntaxes = [
            '1.2.840.10008.1.1', // Verification
            '1.2.840.10008.5.1.4.31', // Modality Worklist
            '1.2.840.10008.5.1.4.1.2.1.1', // Patient Root Query/Retrieve - FIND
            '1.2.840.10008.5.1.4.1.2.2.1', // Study Root Query/Retrieve - FIND
            '1.2.840.10008.5.1.4.1.2.1.2', // Patient Root Query/Retrieve - MOVE
            '1.2.840.10008.5.1.4.1.2.2.2', // Study Root Query/Retrieve - MOVE
          ];

          if (allowedSyntaxes.includes(abstractSyntax)) {
            const transferSyntaxes = context.getTransferSyntaxUids();
            context.setResult(0, transferSyntaxes[0]); // Accept
          } else {
            context.setResult(3); // Refuse
          }
        });
        this.sendAssociationAccept();
      }

      cEchoRequest(request, callback) {
        const callingAet = this.association ? this.association.getCallingAeTitle() : 'Unknown';
        addScpLog(`Received C-ECHO request from ${callingAet}`, 'success');
        
        const response = CEchoResponse.fromRequest(request);
        response.setStatus(0x0000);
        callback(response);
      }

      async cFindRequest(request, callback) {
        const callingAet = this.association ? this.association.getCallingAeTitle() : 'Unknown';
        const query = request.getDataset().getElements();
        
        addScpLog(`Received C-FIND request from ${callingAet}`, 'info');
        console.log(`  🔍 C-FIND from ${callingAet}. Query:`, JSON.stringify(query, null, 2));

        try {
          // Get all images from our "Archive" (stored images folder)
          const allImages = await getStoredImagesDatasets();
          
          // Deduplicate images to studies if needed? For FIND at Study level, 
          // usually we should return one response per study.
          // For simplicity, we'll return one response per unique StudyInstanceUID found.
          const studyMap = new Map();
          allImages.forEach(img => {
            const studyUid = img.StudyInstanceUID || 'unknown';
            if (!studyMap.has(studyUid)) {
              studyMap.set(studyUid, img);
            }
          });

          const matches = Array.from(studyMap.values()).filter(img => matchesQuery(query, img));
          
          addScpLog(`C-FIND: Found ${matches.length} matching studies for ${callingAet}`, matches.length > 0 ? 'success' : 'info');

          const responses = [];
          // Send back each match
          matches.forEach(match => {
            const response = CFindResponse.fromRequest(request);
            // Clean match of any internal properties starting with _
            const cleanMatch = {};
            for (const key in match) {
              if (!key.startsWith('_')) cleanMatch[key] = match[key];
            }
            response.setDataset(new Dataset(cleanMatch));
            response.setStatus(0xFF00); // Pending
            responses.push(response);
          });

          // Final response
          const finalResponse = CFindResponse.fromRequest(request);
          finalResponse.setStatus(0x0000); // Success
          responses.push(finalResponse);

          // Call callback once with all pooled responses
          callback(responses);
        } catch (err) {
          console.error('C-FIND Error:', err);
          addScpLog(`C-FIND Error: ${err.message}`, 'error');
          const errResponse = CFindResponse.fromRequest(request);
          errResponse.setStatus(0xC001); // Unable to process
          callback(errResponse);
        }
      }

      async cMoveRequest(request, callback) {
        const callingAet = this.association ? this.association.getCallingAeTitle() : 'Unknown';
        
        // C-MOVE destination is in the Command Dataset
        const cmdElements = request.getCommandDataset().getElements();
        const moveDestination = cmdElements.MoveDestination || cmdElements['00000600'];
        
        const query = request.getDataset().getElements();
        
        addScpLog(`Received C-MOVE request from ${callingAet} to destination ${moveDestination}`, 'info');
        console.log(`  📦 C-MOVE from ${callingAet} to ${moveDestination}. Query:`, JSON.stringify(query, null, 2));

        try {
          const settings = readSettings();
          let target = null;
          
          // Search in RIS array
          if (settings.ris && Array.isArray(settings.ris)) {
            target = settings.ris.find(r => r.aeTitle === moveDestination);
          }
          
          // Search in PACS array
          if (!target && settings.pacs && Array.isArray(settings.pacs)) {
            target = settings.pacs.find(p => p.aeTitle === moveDestination);
          }
          
          if (!target) {
            const msg = `C-MOVE Error: Unknown destination AE Title "${moveDestination}". Please add it to your PACS/RIS settings.`;
            addScpLog(msg, 'error');
            console.warn(`  ⚠️ ${msg}`);
            const errResponse = CMoveResponse.fromRequest(request);
            errResponse.setStatus(0xA801); // Move destination unknown
            callback(errResponse);
            return;
          }

          // Get matching images with paths
          const allImages = await getStoredImages();
          const matches = allImages.filter(img => matchesQuery(query, img.dataset));
          
          addScpLog(`C-MOVE: Found ${matches.length} matching images for ${callingAet}`, matches.length > 0 ? 'success' : 'info');

          if (matches.length === 0) {
            const finalResponse = CMoveResponse.fromRequest(request);
            finalResponse.setStatus(0x0000); // Success (0 matches)
            finalResponse.final = true; // Mark as final for the library dispatcher
            callback(finalResponse);
            return;
          }
          // Process C-STORE sub-operations
          let completed = 0;
          let failed = 0;
          const responses = [];

          for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            const results = await internalStore(
              target.ipAddress, 
              target.port, 
              settings.emulator.aeTitle, 
              moveDestination, 
              [match.filePath]
            );

            completed += results.completed;
            failed += results.failed;

            // Add Pending response to the queue
            const pendingResponse = CMoveResponse.fromRequest(request);
            pendingResponse.setStatus(0xFF00); // Pending
            const pCmd = pendingResponse.getCommandDataset();
            
            const remaining = matches.length - (i + 1);
            pCmd.setElement('numberOfRemainingSuboperations', remaining);
            pCmd.setElement('numberOfCompletedSuboperations', completed);
            pCmd.setElement('numberOfFailedSuboperations', failed);
            pCmd.setElement('numberOfWarningSuboperations', 0);
            
            // Manual tag settings for safety
            const pElements = pCmd.getElements();
            pElements['00001020'] = remaining;
            pElements['00001021'] = completed;
            pElements['00001022'] = failed;
            pElements['00001023'] = 0;

            responses.push(pendingResponse);
          }

          addScpLog(`C-MOVE complete: Sent ${completed} images, ${failed} failed`, failed === 0 ? 'success' : 'warning');

          const finalResponse = CMoveResponse.fromRequest(request);
          finalResponse.setStatus(failed > 0 ? 0xB000 : 0x0000); // Warning/Success
          
          const fCmd = finalResponse.getCommandDataset();
          // Set tags using both raw hex and keywords to ensure library handles it correctly
          const setElem = (tag, keyword, val) => {
            try { fCmd.setElement(tag, val); } catch (e) {}
            try { fCmd.setElement(keyword, val); } catch (e) {}
          };
          setElem('00001020', 'NumberOfRemainingSuboperations', 0);
          setElem('00001021', 'NumberOfCompletedSuboperations', completed);
          setElem('00001022', 'NumberOfFailedSuboperations', failed);
          setElem('00001023', 'NumberOfWarningSuboperations', 0);
          
          console.log(`  ✅ C-MOVE: Sending final response. Status: 0x${finalResponse.getStatus().toString(16).toUpperCase()}. Elements:`, JSON.stringify(fCmd.getElements()));
          
          callback([finalResponse]);
        } catch (err) {
          console.error('C-MOVE Error:', err);
          addScpLog(`C-MOVE Error: ${err.message}`, 'error');
          const errResponse = CMoveResponse.fromRequest(request);
          errResponse.setStatus(0xC001); // Unable to process
          callback([errResponse]);
        }
      }

      associationReleaseRequested() {
        if (this.association) {
          const callingAet = this.association.getCallingAeTitle();
          addScpLog(`Association released by ${callingAet}`, 'info');
        }
        this.sendAssociationReleaseResponse();
      }
    }

    scpServer = new Server(ModalityScp);
    scpServer.on('networkError', (e) => {
      console.error('SCP network error:', e);
      addScpLog(`Network error: ${e.message}`, 'error');
    });

    scpServer.listen(listenPort);
    isRunning = true;
    currentPort = listenPort;
    currentAeTitle = aeTitle;

    addScpLog(`Emulator SCP started on port ${listenPort} (AE: ${aeTitle})`, 'success');
    console.log(`  ✅ Emulator SCP started on port ${listenPort} (AE: ${aeTitle})`);
    res.json({ running: true, port: listenPort, aeTitle });
  } catch (err) {
    console.error('Failed to start emulator:', err);
    addScpLog(`Failed to start emulator: ${err.message}`, 'error');
    res.status(500).json({ running: false, error: err.message });
  }
});

// POST /api/emulator/stop
router.post('/stop', (req, res) => {
  if (!isRunning) {
    return res.json({ running: false });
  }

  try {
    if (scpServer) {
      scpServer.close();
      scpServer = null;
    }
    isRunning = false;
    const stoppedPort = currentPort;
    currentPort = null;
    currentAeTitle = null;

    addScpLog(`Emulator SCP service stopped`, 'info');
    console.log(`  ⏹ Emulator SCP stopped (was on port ${stoppedPort})`);
    res.json({ running: false });
  } catch (err) {
    console.error('Failed to stop emulator:', err);
    addScpLog(`Error stopping emulator: ${err.message}`, 'error');
    res.status(500).json({ running: isRunning, error: err.message });
  }
});

// GET /api/emulator/status
router.get('/status', (req, res) => {
  res.json({ running: isRunning, port: currentPort, aeTitle: currentAeTitle });
});

// GET /api/emulator/logs
router.get('/logs', (req, res) => {
  res.json(scpLogs);
});

// DELETE /api/emulator/logs
router.delete('/logs', (req, res) => {
  scpLogs = [];
  res.json({ success: true });
});

export default router;
