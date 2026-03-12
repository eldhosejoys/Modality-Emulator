import { useState, useEffect } from 'react';
import { FiSave } from 'react-icons/fi';
import * as api from '../api';
import type { LogEntry } from '../App';

interface Props {
  settings: api.Settings;
  onSave: (s: api.Settings) => Promise<void>;
  addLog: (msg: string, type?: LogEntry['type']) => void;
}

export default function RemoteSystemsTab({ settings, onSave, addLog }: Props) {
  const [ris, setRis] = useState(settings.ris);
  const [pacs, setPacs] = useState(settings.pacs);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRis(settings.ris);
    setPacs(settings.pacs);
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ ...settings, ris, pacs });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* RIS System */}
      <div className="glass-card p-5">
        <h3 className="text-base font-semibold text-text-primary mb-4">RIS System</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">IP Address</label>
            <input
              id="ris-ip"
              className="input"
              value={ris.ipAddress}
              onChange={(e) => setRis({ ...ris, ipAddress: e.target.value })}
              placeholder="192.168.1.2"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">Remote Port</label>
            <input
              id="ris-port"
              className="input"
              type="number"
              value={ris.port}
              onChange={(e) => setRis({ ...ris, port: parseInt(e.target.value) || 0 })}
              placeholder="4242"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">AE Title</label>
            <input
              id="ris-ae"
              className="input"
              value={ris.aeTitle}
              onChange={(e) => setRis({ ...ris, aeTitle: e.target.value })}
              placeholder="ORTHANC"
            />
          </div>
        </div>
      </div>

      {/* PACS / Workstation */}
      <div className="glass-card p-5">
        <h3 className="text-base font-semibold text-text-primary mb-4">PACS / Workstation Systems</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">IP Address</label>
            <input
              id="pacs-ip"
              className="input"
              value={pacs.ipAddress}
              onChange={(e) => setPacs({ ...pacs, ipAddress: e.target.value })}
              placeholder="192.168.1.2"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">Remote Port</label>
            <input
              id="pacs-port"
              className="input"
              type="number"
              value={pacs.port}
              onChange={(e) => setPacs({ ...pacs, port: parseInt(e.target.value) || 0 })}
              placeholder="4242"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">AE Title</label>
            <input
              id="pacs-ae"
              className="input"
              value={pacs.aeTitle}
              onChange={(e) => setPacs({ ...pacs, aeTitle: e.target.value })}
              placeholder="ORTHANC"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          id="btn-save-remote"
          className="btn btn-success"
          onClick={handleSave}
          disabled={saving}
        >
          <FiSave /> {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
