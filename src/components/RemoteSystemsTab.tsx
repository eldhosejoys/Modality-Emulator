import { useState, useEffect } from 'react';
import { FiSave, FiPlus, FiTrash2 } from 'react-icons/fi';
import * as api from '../api';
import type { LogEntry } from '../App';

interface Props {
  settings: api.Settings;
  onSave: (s: api.Settings) => Promise<void>;
  addLog: (msg: string, type?: LogEntry['type']) => void;
}

export default function RemoteSystemsTab({ settings, onSave, addLog }: Props) {
  const [risList, setRisList] = useState<api.RemoteSystem[]>(settings.ris || []);
  const [pacsList, setPacsList] = useState<api.RemoteSystem[]>(settings.pacs || []);
  const [selectedRisId, setSelectedRisId] = useState<string>(settings.selectedRisId || '');
  const [selectedPacsId, setSelectedPacsId] = useState<string>(settings.selectedPacsId || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRisList(settings.ris || []);
    setPacsList(settings.pacs || []);
    setSelectedRisId(settings.selectedRisId || '');
    setSelectedPacsId(settings.selectedPacsId || '');
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ 
        ...settings, 
        ris: risList, 
        pacs: pacsList, 
        selectedRisId, 
        selectedPacsId 
      });
    } finally {
      setSaving(false);
    }
  };

  const addSystem = (type: 'ris' | 'pacs') => {
    const newSystem: api.RemoteSystem = {
      id: `${type}-${Date.now()}`,
      name: `${type.toUpperCase()} ${type === 'ris' ? risList.length + 1 : pacsList.length + 1}`,
      ipAddress: '127.0.0.1',
      port: 4242,
      aeTitle: type.toUpperCase()
    };
    
    if (type === 'ris') {
      const newList = [...risList, newSystem];
      setRisList(newList);
      if (!selectedRisId) setSelectedRisId(newSystem.id);
    } else {
      const newList = [...pacsList, newSystem];
      setPacsList(newList);
      if (!selectedPacsId) setSelectedPacsId(newSystem.id);
    }
  };

  const removeSystem = (type: 'ris' | 'pacs', id: string) => {
    if (type === 'ris') {
      const newList = risList.filter(s => s.id !== id);
      setRisList(newList);
      if (selectedRisId === id) setSelectedRisId(newList[0]?.id || '');
    } else {
      const newList = pacsList.filter(s => s.id !== id);
      setPacsList(newList);
      if (selectedPacsId === id) setSelectedPacsId(newList[0]?.id || '');
    }
  };

  const updateSystem = (type: 'ris' | 'pacs', id: string, updates: Partial<api.RemoteSystem>) => {
    if (type === 'ris') {
      setRisList(risList.map(s => s.id === id ? { ...s, ...updates } : s));
    } else {
      setPacsList(pacsList.map(s => s.id === id ? { ...s, ...updates } : s));
    }
  };

  const SystemList = ({ type, list, selectedId, onSelect }: { 
    type: 'ris' | 'pacs', 
    list: api.RemoteSystem[], 
    selectedId: string, 
    onSelect: (id: string) => void 
  }) => (
    <div className="glass-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-bg-secondary/30 flex justify-between items-center">
        <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">
          {type === 'ris' ? 'RIS / Worklist Systems' : 'PACS / Workstation Systems'}
        </h3>
        <button 
          type="button" 
          className="btn btn-outline py-1 px-3 text-[10px] gap-2 border-accent/30 text-accent hover:bg-accent/10"
          onClick={() => addSystem(type)}
        >
          <FiPlus size={12} /> ADD {type.toUpperCase()}
        </button>
      </div>
      <div className="divide-y divide-border">
        {list.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-text-muted text-sm">No {type.toUpperCase()} systems configured.</p>
          </div>
        ) : (
          list.map((s) => (
            <div key={s.id} className="p-4 group hover:bg-white/[0.02] transition-colors">
              <div className="grid grid-cols-1 sm:grid-cols-[48px_1.2fr_1.2fr_80px_1fr] gap-x-4 gap-y-4 items-end">
                <div className="flex flex-col items-center">
                  <label className="block text-[8px] font-bold text-text-muted uppercase mb-2.5 opacity-60 text-center">Default</label>
                  <div className="h-9 flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => onSelect(s.id)}
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${selectedId === s.id ? 'border-accent bg-accent' : 'border-border hover:border-accent/50'}`}
                    >
                      {selectedId === s.id && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-text-muted uppercase tracking-wider mb-1.5 opacity-70">Friendly Name</label>
                  <input
                    className="input h-9"
                    value={s.name}
                    onChange={(e) => updateSystem(type, s.id, { name: e.target.value })}
                    placeholder="e.g. Main Archive"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-text-muted uppercase tracking-wider mb-1.5 opacity-70">IP Address</label>
                  <input
                    className="input h-9"
                    value={s.ipAddress}
                    onChange={(e) => updateSystem(type, s.id, { ipAddress: e.target.value })}
                    placeholder="127.0.0.1"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-text-muted uppercase tracking-wider mb-1.5 opacity-70">Port</label>
                  <input
                    className="input h-9"
                    type="number"
                    value={s.port}
                    onChange={(e) => updateSystem(type, s.id, { port: parseInt(e.target.value) || 0 })}
                    placeholder="104"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-text-muted uppercase tracking-wider mb-1.5 opacity-70">AE Title</label>
                  <div className="flex gap-2">
                    <input
                      className="input flex-1 h-9"
                      value={s.aeTitle}
                      onChange={(e) => updateSystem(type, s.id, { aeTitle: e.target.value })}
                      placeholder="ORTHANC"
                    />
                    <button
                      type="button"
                      className="h-9 w-9 flex-shrink-0 flex items-center justify-center text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors border border-border/30"
                      onClick={() => removeSystem(type, s.id)}
                      title={`Remove ${type.toUpperCase()}`}
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="w-full space-y-8">
      <SystemList type="ris" list={risList} selectedId={selectedRisId} onSelect={setSelectedRisId} />
      <SystemList type="pacs" list={pacsList} selectedId={selectedPacsId} onSelect={setSelectedPacsId} />

      <div className="flex justify-end pt-2">
        <button
          type="button"
          id="btn-save-remote"
          className="btn btn-primary h-11 px-8 shadow-lg shadow-accent/20"
          onClick={handleSave}
          disabled={saving}
        >
          <FiSave className={saving ? 'animate-spin' : ''} /> 
          {saving ? 'Saving Changes...' : 'Save All Systems'}
        </button>
      </div>
    </div>
  );
}
