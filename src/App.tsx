import { useState, useEffect, useCallback } from 'react';
import { FiRadio, FiTrash2, FiSettings } from 'react-icons/fi';
import ControlTab from './components/ControlTab';
import WorklistTab from './components/WorklistTab';
import ImageStorageTab from './components/ImageStorageTab';
import ActivityLog from './components/ActivityLog';
import SettingsModal from './components/SettingsModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import * as api from './api';

export interface LogEntry {
  id: number | string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

const TABS = [
  { id: 'control', label: 'Control' },
  { id: 'worklist', label: 'Worklist Query' },
  { id: 'storage', label: 'Image Storage' },
] as const;

export type TabId = typeof TABS[number]['id'];

let logIdCounter = 0;

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('control');
  const [settings, setSettings] = useState<api.Settings | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [emulatorStatus, setEmulatorStatus] = useState<api.EmulatorStatus>({ running: false });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorklist, setSelectedWorklist] = useState<any | null>(null);
  const [worklistResults, setWorklistResults] = useState<any[]>([]);
  const [worklistViewMode, setWorklistViewMode] = useState<'local' | 'live'>('live');
  const [worklistExternalQuery, setWorklistExternalQuery] = useState<api.WorklistQuery | null>(null);
  const [worklistQuery, setWorklistQuery] = useState<api.WorklistQuery>({
    PatientName: '*',
    PatientID: '',
    AccessionNumber: '',
    Modality: '',
    ScheduledProcedureStepStartDate: '',
    ScheduledPerformingPhysicianName: '',
  });
  const [worklistFormMode, setWorklistFormMode] = useState<'form' | 'json'>('form');
  const [worklistPanelStates, setWorklistPanelStates] = useState({
    query: true,
    fileList: true
  });

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const id = ++logIdCounter;
    setLogs((prev) => [
      {
        id,
        timestamp: new Date().toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        }),
        message,
        type,
      },
      ...prev,
    ].slice(0, 200));

    // Also add to toasts - only for success/error, latest first, max 1
    if (type !== 'info') {
      setToasts([{ id, message, type }]);
    }
  }, []);

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const clearLogs = () => {
    setLogs([]);
    api.clearEmulatorLogs().catch(console.error);
  };

  const deleteLog = (id: number | string) => {
    setLogs((prev) => prev.filter((log) => log.id !== id));
  };

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

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const pollLogs = async () => {
      try {
        const serverLogs = await api.getEmulatorLogs();
        setLogs((prev) => {
          // Merge server logs that aren't already in the local state
          const newLogs = serverLogs.filter(sl => !prev.some(pl => pl.id === sl.id));
          if (newLogs.length === 0) return prev;
          
          const formattedNewLogs = newLogs.map(log => ({
            ...log,
            timestamp: new Date(log.timestamp).toLocaleTimeString(undefined, {
              hour: 'numeric',
              minute: '2-digit',
              second: '2-digit',
              hour12: true
            })
          }));

          return [...formattedNewLogs, ...prev].slice(0, 200);
        });
      } catch (err) {
        console.error('Failed to fetch server logs:', err);
      }
    };

    // Poll every 2 seconds when emulator is running
    if (emulatorStatus.running) {
      pollLogs(); // Run once immediately
      intervalId = setInterval(pollLogs, 2000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [emulatorStatus.running]);

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

  const handleSelectWorklist = useCallback((worklist: any | null) => {
    setSelectedWorklist(worklist);
  }, []);

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

          <div className="ml-auto flex items-center gap-4">
            <div className="flex items-center gap-2 pr-4 border-r border-border">
              <div className={`w-2 h-2 rounded-full ${emulatorStatus.running ? 'bg-success pulse-dot' : 'bg-danger'}`} />
              <span className="text-xs font-medium text-text-secondary">
                {emulatorStatus.running ? `Running on port ${emulatorStatus.port}` : 'Stopped'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-text-secondary hover:text-accent-light"
              title="Settings"
            >
              <FiSettings className="text-xl" />
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="flex-shrink-0 flex border-b border-border overflow-x-auto px-4"
        style={{ background: 'rgba(17,24,39,0.5)' }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
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
          {activeTab === 'worklist' && (
            <WorklistTab 
              addLog={addLog} 
              selectedWorklist={selectedWorklist} 
              onSelectWorklist={handleSelectWorklist} 
              setActiveTab={setActiveTab}
              queryResults={worklistResults}
              setQueryResults={setWorklistResults}
              viewMode={worklistViewMode}
              setViewMode={setWorklistViewMode}
              externalQuery={worklistExternalQuery}
              setExternalQuery={setWorklistExternalQuery}
              panelStates={worklistPanelStates}
              setPanelStates={setWorklistPanelStates}
              query={worklistQuery}
              setQuery={setWorklistQuery}
              formMode={worklistFormMode}
              setFormMode={setWorklistFormMode}
            />
          )}
          {activeTab === 'storage' && (
            <ImageStorageTab 
              addLog={addLog} 
              selectedWorklist={selectedWorklist} 
              onSelectWorklist={handleSelectWorklist}
              setActiveTab={setActiveTab}
            />
          )}
        </main>

        {/* Activity Log sidebar */}
        <aside className="w-80 flex-shrink-0 border-l border-border flex flex-col"
          style={{ background: 'rgba(10,14,26,0.6)' }}>
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="section-header mb-0">Activity Log</h2>
            {logs.length > 0 && (
              <button 
                type="button"
                onClick={clearLogs}
                className="text-[10px] font-bold uppercase text-text-muted hover:text-danger transition-colors px-1"
                title="Clear all logs"
              >
                Clear All
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <ActivityLog logs={logs} onDelete={deleteLog} />
          </div>
        </aside>
      </div>

      {settings && (
        <SettingsModal 
          isOpen={isSettingsOpen} 
          onClose={() => setIsSettingsOpen(false)} 
          settings={settings}
          onSave={handleSaveSettings}
          addLog={addLog}
        />
      )}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
