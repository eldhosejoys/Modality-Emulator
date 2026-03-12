import { useState, useEffect, useCallback } from 'react';
import { FiRadio } from 'react-icons/fi';
import ControlTab from './components/ControlTab';
import RemoteSystemsTab from './components/RemoteSystemsTab';
import EmulatorConfigTab from './components/EmulatorConfigTab';
import WorklistTab from './components/WorklistTab';
import ImageStorageTab from './components/ImageStorageTab';
import ActivityLog from './components/ActivityLog';
import * as api from './api';

export interface LogEntry {
  id: number;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

const TABS = [
  { id: 'control', label: 'Control' },
  { id: 'remote', label: 'Remote Systems' },
  { id: 'emulator', label: 'Emulator Config' },
  { id: 'worklist', label: 'Worklist Query' },
  { id: 'storage', label: 'Image Storage' },
] as const;

type TabId = typeof TABS[number]['id'];

let logIdCounter = 0;

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('control');
  const [settings, setSettings] = useState<api.Settings | null>(null);
  const [emulatorStatus, setEmulatorStatus] = useState<api.EmulatorStatus>({ running: false });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorklist, setSelectedWorklist] = useState<any | null>(null);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs((prev) => [
      {
        id: ++logIdCounter,
        timestamp: new Date().toLocaleTimeString(),
        message,
        type,
      },
      ...prev,
    ].slice(0, 200));
  }, []);

  useEffect(() => {
    Promise.all([api.getSettings(), api.getEmulatorStatus()])
      .then(([s, st]) => {
        setSettings(s);
        setEmulatorStatus(st);
        addLog('Connected to backend', 'success');
      })
      .catch((err) => {
        addLog(`Failed to connect to backend: ${err.message}`, 'error');
      })
      .finally(() => setLoading(false));
  }, [addLog]);

  const handleSaveSettings = async (newSettings: api.Settings) => {
    try {
      const saved = await api.saveSettings(newSettings);
      setSettings(saved);
      addLog('Settings saved successfully', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addLog(`Failed to save settings: ${msg}`, 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <FiRadio className="mx-auto text-4xl text-accent-light mb-4 animate-pulse" />
          <p className="text-text-secondary">Connecting to backend...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-border px-6 py-3"
        style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(16,185,129,0.04))' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-light))' }}>
            <FiRadio className="text-white text-lg" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-text-primary tracking-tight">Modality Emulator</h1>
            <p className="text-xs text-text-muted">DICOM Modality Testing Tool</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${emulatorStatus.running ? 'bg-success pulse-dot' : 'bg-danger'}`} />
            <span className="text-xs font-medium text-text-secondary">
              {emulatorStatus.running ? `Running on port ${emulatorStatus.port}` : 'Stopped'}
            </span>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="flex-shrink-0 flex border-b border-border overflow-x-auto px-4"
        style={{ background: 'rgba(17,24,39,0.5)' }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content area */}
      <div className="flex flex-1 min-h-0">
        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-5 fade-in" key={activeTab}>
          {activeTab === 'control' && settings && (
            <ControlTab
              settings={settings}
              emulatorStatus={emulatorStatus}
              setEmulatorStatus={setEmulatorStatus}
              addLog={addLog}
            />
          )}
          {activeTab === 'remote' && settings && (
            <RemoteSystemsTab settings={settings} onSave={handleSaveSettings} addLog={addLog} />
          )}
          {activeTab === 'emulator' && settings && (
            <EmulatorConfigTab settings={settings} onSave={handleSaveSettings} addLog={addLog} />
          )}
          {activeTab === 'worklist' && (
            <WorklistTab 
              addLog={addLog} 
              selectedWorklist={selectedWorklist} 
              onSelectWorklist={setSelectedWorklist} 
            />
          )}
          {activeTab === 'storage' && (
            <ImageStorageTab 
              addLog={addLog} 
              selectedWorklist={selectedWorklist} 
              onSelectWorklist={setSelectedWorklist}
            />
          )}
        </main>

        {/* Activity Log sidebar */}
        <aside className="w-80 flex-shrink-0 border-l border-border flex flex-col"
          style={{ background: 'rgba(10,14,26,0.6)' }}>
          <div className="px-4 py-3 border-b border-border">
            <h2 className="section-header mb-0">Activity Log</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <ActivityLog logs={logs} />
          </div>
        </aside>
      </div>
    </div>
  );
}
