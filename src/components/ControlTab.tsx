import { useState } from 'react';
import { FiPlay, FiSquare, FiActivity, FiWifi, FiSend, FiUploadCloud } from 'react-icons/fi';
import * as api from '../api';
import type { LogEntry } from '../App';

interface Props {
  settings: api.Settings;
  emulatorStatus: api.EmulatorStatus;
  setEmulatorStatus: (s: api.EmulatorStatus) => void;
  addLog: (msg: string, type?: LogEntry['type']) => void;
}

export default function ControlTab({ settings, emulatorStatus, setEmulatorStatus, addLog }: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  const handleAction = async (actionName: string, fn: () => Promise<unknown>) => {
    setBusy(actionName);
    addLog(`${actionName}...`, 'info');
    try {
      const result = await fn();
      const msg = (result as { message?: string })?.message || 'Done';
      addLog(`${actionName}: ${msg}`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addLog(`${actionName} failed: ${msg}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleStart = () =>
    handleAction('Start Emulator', async () => {
      const status = await api.startEmulator();
      setEmulatorStatus(status);
      return status;
    });

  const handleStop = () =>
    handleAction('Stop Emulator', async () => {
      const status = await api.stopEmulator();
      setEmulatorStatus(status);
      return status;
    });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Emulator Status */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Emulator Status</h2>
            <p className="text-sm text-text-secondary mt-1">
              {emulatorStatus.running
                ? `Listening as "${settings.emulator.aeTitle}" on port ${emulatorStatus.port}`
                : 'Emulator is not running'}
            </p>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold
            ${emulatorStatus.running ? 'bg-success-glow text-success' : 'bg-danger-glow text-danger'}`}>
            <div className={`w-2 h-2 rounded-full ${emulatorStatus.running ? 'bg-success pulse-dot' : 'bg-danger'}`} />
            {emulatorStatus.running ? 'Running' : 'Stopped'}
          </div>
        </div>
        <div className="flex gap-3">
          <button
            id="btn-start-emulator"
            className="btn btn-success"
            onClick={handleStart}
            disabled={emulatorStatus.running || busy !== null}
          >
            <FiPlay /> Start Emulator
          </button>
          <button
            id="btn-stop-emulator"
            className="btn btn-danger"
            onClick={handleStop}
            disabled={!emulatorStatus.running || busy !== null}
          >
            <FiSquare /> Stop Emulator
          </button>
        </div>
      </div>

      {/* RIS System */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-base font-semibold text-text-primary">RIS System</h3>
          <span className="text-xs text-text-muted">→ {settings.ris.ipAddress}:{settings.ris.port} ({settings.ris.aeTitle})</span>
        </div>
        <p className="text-sm text-text-secondary mb-4">
          Interact with the configured RIS (Radiology Information System)
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            id="btn-ping-ris"
            className="btn btn-primary"
            onClick={() => handleAction('Ping RIS', () => api.pingHost('ris'))}
            disabled={busy !== null}
          >
            <FiWifi /> {busy === 'Ping RIS' ? 'Pinging...' : 'Ping RIS'}
          </button>
          <button
            id="btn-echo-ris"
            className="btn btn-primary"
            onClick={() => handleAction('DICOM Echo (RIS)', () => api.dicomEcho('ris'))}
            disabled={busy !== null}
          >
            <FiActivity /> {busy === 'DICOM Echo (RIS)' ? 'Echoing...' : 'DICOM Echo'}
          </button>
          <button
            id="btn-request-worklist"
            className="btn btn-primary"
            onClick={() => handleAction('Request Worklist', () => api.requestWorklist())}
            disabled={busy !== null}
          >
            <FiSend /> {busy === 'Request Worklist' ? 'Requesting...' : 'Request Worklist'}
          </button>
        </div>
      </div>

      {/* PACS / Workstation */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-base font-semibold text-text-primary">PACS / Workstation</h3>
          <span className="text-xs text-text-muted">→ {settings.pacs.ipAddress}:{settings.pacs.port} ({settings.pacs.aeTitle})</span>
        </div>
        <p className="text-sm text-text-secondary mb-4">
          Interact with the configured PACS or Workstation
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            id="btn-ping-pacs"
            className="btn btn-primary"
            onClick={() => handleAction('Ping PACS', () => api.pingHost('pacs'))}
            disabled={busy !== null}
          >
            <FiWifi /> {busy === 'Ping PACS' ? 'Pinging...' : 'Ping PACS'}
          </button>
          <button
            id="btn-echo-pacs"
            className="btn btn-primary"
            onClick={() => handleAction('DICOM Echo (PACS)', () => api.dicomEcho('pacs'))}
            disabled={busy !== null}
          >
            <FiActivity /> {busy === 'DICOM Echo (PACS)' ? 'Echoing...' : 'DICOM Echo'}
          </button>
          <button
            id="btn-store-images"
            className="btn btn-primary"
            onClick={() => handleAction('Store Image', () => api.storeImages([]))}
            disabled={busy !== null}
          >
            <FiUploadCloud /> {busy === 'Store Image' ? 'Storing...' : 'Store Image'}
          </button>
        </div>
        <p className="text-xs text-text-muted mt-3">
          💡 To select specific images for storage, go to the <strong>Image Storage</strong> tab, select files, then use the Store button there.
        </p>
      </div>
    </div>
  );
}
