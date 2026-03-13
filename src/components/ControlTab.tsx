import { useState } from 'react';
import { FiPlay, FiSquare, FiActivity, FiWifi, FiRadio, FiDatabase, FiUploadCloud } from 'react-icons/fi';
import * as api from '../api';
import type { LogEntry } from '../App';

interface Props {
  settings: api.Settings;
  emulatorStatus: api.EmulatorStatus;
  setEmulatorStatus: (s: api.EmulatorStatus) => void;
  addLog: (msg: string, type?: LogEntry['type']) => void;
  onUpdateSettings: (s: api.Settings) => Promise<void>;
}

export default function ControlTab({ settings, emulatorStatus, setEmulatorStatus, addLog, onUpdateSettings }: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  const ris = settings.ris.find(r => r.id === settings.selectedRisId) || settings.ris[0];
  const pacs = settings.pacs.find(p => p.id === settings.selectedPacsId) || settings.pacs[0];

  const handleAction = async (actionName: string, fn: () => Promise<unknown>) => {
    setBusy(actionName);
    addLog(`${actionName}...`, 'info');
    try {
      const result = await fn();
      const res = result as { success?: boolean; message?: string };
      const success = res.success !== false;
      const msg = res.message || 'Done';
      addLog(`${actionName}: ${msg}`, success ? 'success' : 'error');
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
    <div className="max-w-5xl mx-auto space-y-8 py-4">
      {/* Emulator Status Card */}
      <div className="glass-card overflow-hidden border-l-4 border-l-accent animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="px-6 py-5 bg-gradient-to-r from-accent/5 to-transparent flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-500 ${emulatorStatus.running ? 'bg-success/10 text-success shadow-[0_0_20px_rgba(16,185,129,0.2)]' : 'bg-danger/10 text-danger'}`}>
              <FiRadio size={24} className={emulatorStatus.running ? 'animate-pulse' : ''} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-primary tracking-tight">Modality Engine</h2>
              <p className="text-xs text-text-muted mt-0.5 font-medium uppercase tracking-widest">
                {emulatorStatus.running 
                  ? `Active • ${emulatorStatus.aeTitle || settings.emulator.aeTitle} @ Port ${emulatorStatus.port}` 
                  : 'Engine Standby'}
              </p>
            </div>
          </div>
          
          <div className="flex gap-3">
            {!emulatorStatus.running ? (
              <button
                type="button"
                id="btn-start-emulator"
                className="btn btn-success px-6 shadow-lg shadow-success/20 hover:shadow-success/40 transition-all"
                onClick={handleStart}
                disabled={busy !== null}
              >
                <FiPlay fill="currentColor" /> Start Service
              </button>
            ) : (
              <button
                type="button"
                id="btn-stop-emulator"
                className="btn btn-danger px-6 shadow-lg shadow-danger/20 hover:shadow-danger/40 transition-all"
                onClick={handleStop}
                disabled={busy !== null}
              >
                <FiSquare fill="currentColor" /> Shutdown
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* RIS System Card */}
        <div className="glass-card p-6 flex flex-col hover:border-accent/30 transition-colors group">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-bg-secondary text-text-muted group-hover:text-accent transition-colors">
                <FiDatabase size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">RIS Connection</h3>
                <div className="flex flex-col gap-1.5 mt-1">
                  <select 
                    className="bg-bg-input border border-border/50 rounded-lg px-2 py-1 text-[11px] text-text-primary outline-none focus:border-accent/50 transition-all font-semibold max-w-[150px]"
                    value={settings.selectedRisId || settings.ris[0]?.id || ''}
                    onChange={(e) => onUpdateSettings({ ...settings, selectedRisId: e.target.value })}
                  >
                    {settings.ris.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  <span className="text-[10px] font-mono text-text-muted block">
                    {ris ? `${ris.ipAddress}:${ris.port}` : 'None Configured'}
                  </span>
                </div>
              </div>
            </div>
            {ris && (
              <div className="text-[10px] bg-bg-secondary px-2 py-0.5 rounded border border-border text-text-muted font-bold tracking-tighter self-start">
                AET: {ris.aeTitle}
              </div>
            )}
          </div>
          
          <p className="text-xs text-text-secondary leading-relaxed mb-8">
            The Radiology Information System manages patient schedules and worklist queries. Verify connectivity before requesting worklists.
          </p>
          
          <div className="flex gap-3 mt-auto">
            <button
              type="button"
              id="btn-ping-ris"
              className="btn btn-outline flex-1 justify-center py-2 h-9 text-[11px] font-bold"
              onClick={() => handleAction('Ping RIS', () => api.pingHost(ris.id))}
              disabled={busy !== null || !ris}
            >
              <FiWifi className="text-accent" /> {busy === 'Ping RIS' ? 'Connecting...' : 'PING HOST'}
            </button>
            <button
              type="button"
              id="btn-echo-ris"
              className="btn btn-outline flex-1 justify-center py-2 h-9 text-[11px] font-bold"
              onClick={() => handleAction('DICOM Echo (RIS)', () => api.dicomEcho(ris.id))}
              disabled={busy !== null || !ris}
            >
              <FiActivity className="text-accent" /> {busy === 'DICOM Echo (RIS)' ? 'Echoing...' : 'C-ECHO'}
            </button>
          </div>
        </div>

        {/* PACS System Card */}
        <div className="glass-card p-6 flex flex-col hover:border-accent/30 transition-colors group">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-bg-secondary text-text-muted group-hover:text-accent transition-colors">
                <FiUploadCloud size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">PACS Storage</h3>
                <div className="flex flex-col gap-1.5 mt-1">
                  <select 
                    className="bg-bg-input border border-border/50 rounded-lg px-2 py-1 text-[11px] text-text-primary outline-none focus:border-accent/50 transition-all font-semibold max-w-[150px]"
                    value={settings.selectedPacsId || settings.pacs[0]?.id || ''}
                    onChange={(e) => onUpdateSettings({ ...settings, selectedPacsId: e.target.value })}
                  >
                    {settings.pacs.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <span className="text-[10px] font-mono text-text-muted block">
                    {pacs ? `${pacs.ipAddress}:${pacs.port}` : 'None Configured'}
                  </span>
                </div>
              </div>
            </div>
            {pacs && (
              <div className="text-[10px] bg-bg-secondary px-2 py-0.5 rounded border border-border text-text-muted font-bold tracking-tighter self-start">
                AET: {pacs.aeTitle}
              </div>
            )}
          </div>
          
          <p className="text-xs text-text-secondary leading-relaxed mb-8">
            Central imaging repository. Verify DICOM storage service availability before attempting to send patient studies.
          </p>
          
          <div className="flex gap-3 mt-auto">
            <button
              type="button"
              id="btn-ping-pacs"
              className="btn btn-outline flex-1 justify-center py-2 h-9 text-[11px] font-bold"
              onClick={() => handleAction('Ping PACS', () => api.pingHost(pacs.id))}
              disabled={busy !== null || !pacs}
            >
              <FiWifi className="text-accent" /> {busy === 'Ping PACS' ? 'Connecting...' : 'PING HOST'}
            </button>
            <button
              type="button"
              id="btn-echo-pacs"
              className="btn btn-outline flex-1 justify-center py-2 h-9 text-[11px] font-bold"
              onClick={() => handleAction('DICOM Echo (PACS)', () => api.dicomEcho(pacs.id))}
              disabled={busy !== null || !pacs}
            >
              <FiActivity className="text-accent" /> {busy === 'DICOM Echo (PACS)' ? 'Echoing...' : 'C-ECHO'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
