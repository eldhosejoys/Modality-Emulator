import { useState, useEffect } from 'react';
import { FiSave } from 'react-icons/fi';
import * as api from '../api';
import type { LogEntry } from '../App';

interface Props {
  settings: api.Settings;
  onSave: (s: api.Settings) => Promise<void>;
  addLog: (msg: string, type?: LogEntry['type']) => void;
}

export default function EmulatorConfigTab({ settings, onSave, addLog }: Props) {
  const [config, setConfig] = useState(settings.emulator);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setConfig(settings.emulator);
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ ...settings, emulator: config });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="glass-card p-5">
        <h3 className="text-base font-semibold text-text-primary mb-4">Emulator Configuration</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">System Name</label>
            <input
              id="emu-system-name"
              className="input"
              value={config.systemName}
              onChange={(e) => setConfig({ ...config, systemName: e.target.value })}
              placeholder="Modality"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">AE Title</label>
            <input
              id="emu-ae-title"
              className="input"
              value={config.aeTitle}
              onChange={(e) => setConfig({ ...config, aeTitle: e.target.value })}
              placeholder="MODALITY"
            />
            <p className="text-xs text-text-muted mt-1">Application Entity Title used when communicating with remote systems</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">Listen Port</label>
            <input
              id="emu-listen-port"
              className="input"
              type="number"
              value={config.listenPort}
              onChange={(e) => setConfig({ ...config, listenPort: parseInt(e.target.value) || 0 })}
              placeholder="104"
            />
            <p className="text-xs text-text-muted mt-1">Port the emulator listens on when started (for incoming DICOM associations)</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          id="btn-save-emulator"
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
