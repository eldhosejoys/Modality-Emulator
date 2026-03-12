import { FiX, FiSettings, FiServer, FiCpu } from 'react-icons/fi';
import { useState } from 'react';
import RemoteSystemsTab from './RemoteSystemsTab';
import EmulatorConfigTab from './EmulatorConfigTab';
import * as api from '../api';
import type { LogEntry } from '../App';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: api.Settings;
  onSave: (s: api.Settings) => Promise<void>;
  addLog: (msg: string, type?: LogEntry['type']) => void;
}

export default function SettingsModal({ isOpen, onClose, settings, onSave, addLog }: Props) {
  const [activeTab, setActiveTab] = useState<'remote' | 'emulator'>('remote');

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm fade-in"
      onClick={onClose}
    >
      <div 
        className="glass-card w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-2">
            <FiSettings className="text-accent-light text-xl" />
            <h2 className="text-lg font-semibold text-text-primary">System Settings</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-text-muted hover:text-text-primary"
          >
            <FiX className="text-xl" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Tabs */}
          <div className="w-64 border-r border-white/10 bg-black/20 p-4 space-y-2">
            <button
              onClick={() => setActiveTab('remote')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'remote' 
                ? 'bg-accent/20 text-accent-light border border-accent/30' 
                : 'text-text-secondary hover:bg-white/5'
              }`}
            >
              <FiServer className={activeTab === 'remote' ? 'text-accent-light' : 'text-text-muted'} />
              Remote Systems
            </button>
            <button
              onClick={() => setActiveTab('emulator')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'emulator' 
                ? 'bg-accent/20 text-accent-light border border-accent/30' 
                : 'text-text-secondary hover:bg-white/5'
              }`}
            >
              <FiCpu className={activeTab === 'emulator' ? 'text-accent-light' : 'text-text-muted'} />
              Emulator Config
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-8 bg-black/10">
            <div className="fade-in" key={activeTab}>
              {activeTab === 'remote' ? (
                <div>
                  <div className="mb-6">
                    <h3 className="text-xl font-bold text-text-primary">Remote Systems</h3>
                    <p className="text-sm text-text-muted">Configure connection details for RIS and PACS/Workstation.</p>
                  </div>
                  <RemoteSystemsTab settings={settings} onSave={onSave} addLog={addLog} />
                </div>
              ) : (
                <div>
                  <div className="mb-6">
                    <h3 className="text-xl font-bold text-text-primary">Emulator Configuration</h3>
                    <p className="text-sm text-text-muted">Configure local AE Title, system name, and listening port.</p>
                  </div>
                  <EmulatorConfigTab settings={settings} onSave={onSave} addLog={addLog} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
