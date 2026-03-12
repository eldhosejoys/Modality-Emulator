import { Router } from 'express';
import { readSettings } from './settings.js';

const router = Router();

// In-memory emulator state
let scpServer = null;
let isRunning = false;
let currentPort = null;
let currentAeTitle = null;

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
    const { Server } = dimse;
    const { CEchoResponse } = dimse.responses;

    class EchoScp extends dimse.Scp {
      constructor(socket, opts) {
        super(socket, opts);
        this.association = undefined;
      }

      associationRequested(association) {
        this.association = association;
        const contexts = association.getPresentationContexts();
        contexts.forEach((c) => {
          const context = association.getPresentationContext(c.id);
          if (context.getAbstractSyntaxUid() === '1.2.840.10008.1.1') {
            // Verification SOP Class
            const transferSyntaxes = context.getTransferSyntaxUids();
            context.setResult(0, transferSyntaxes[0]); // Accept
          } else {
            context.setResult(3); // Refuse
          }
        });
        this.sendAssociationAccept();
      }

      cEchoRequest(request, callback) {
        const response = CEchoResponse.fromRequest(request);
        response.setStatus(0x0000);
        callback(response);
      }

      associationReleaseRequested() {
        this.sendAssociationReleaseResponse();
      }
    }

    scpServer = new Server(EchoScp);
    scpServer.on('networkError', (e) => {
      console.error('SCP network error:', e);
    });

    scpServer.listen(listenPort);
    isRunning = true;
    currentPort = listenPort;
    currentAeTitle = aeTitle;

    console.log(`  ✅ Emulator SCP started on port ${listenPort} (AE: ${aeTitle})`);
    res.json({ running: true, port: listenPort, aeTitle });
  } catch (err) {
    console.error('Failed to start emulator:', err);
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

    console.log(`  ⏹ Emulator SCP stopped (was on port ${stoppedPort})`);
    res.json({ running: false });
  } catch (err) {
    console.error('Failed to stop emulator:', err);
    res.status(500).json({ running: isRunning, error: err.message });
  }
});

// GET /api/emulator/status
router.get('/status', (req, res) => {
  res.json({ running: isRunning, port: currentPort, aeTitle: currentAeTitle });
});

export default router;
