import { useState, useEffect, useRef } from 'react';
import { FiFile, FiUpload, FiTrash2, FiUploadCloud, FiCheckSquare, FiSquare } from 'react-icons/fi';
import * as api from '../api';
import type { LogEntry, TabId } from '../App';

interface Props {
  addLog: (msg: string, type?: LogEntry['type']) => void;
  selectedWorklist: any | null;
  onSelectWorklist: (worklist: any | null) => void;
  setActiveTab?: (tab: TabId) => void;
}

export default function ImageStorageTab({ addLog, selectedWorklist, onSelectWorklist, setActiveTab }: Props) {
  const [files, setFiles] = useState<api.FileInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [tags, setTags] = useState<api.DicomTag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [storing, setStoring] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Helper to format DICOM values (handles strings vs complex objects like PN)
  const formatDicomValue = (val: any): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'object') {
      if (val.Alphabetic) return val.Alphabetic;
      // Fallback for other potential objects or arrays
      return JSON.stringify(val);
    }
    return String(val);
  };

  const loadFiles = async () => {
    try {
      const list = await api.listFiles('images');
      setFiles(list);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addLog(`Failed to load image files: ${msg}`, 'error');
    }
  };

  useEffect(() => { loadFiles(); }, []);

  const handleSelect = async (name: string) => {
    setSelected(name);
    setLoadingTags(true);
    try {
      const parsed = await api.parseFile('images', name);
      setTags(parsed);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addLog(`Failed to parse ${name}: ${msg}`, 'error');
      setTags([]);
    } finally {
      setLoadingTags(false);
    }
  };

  const toggleCheck = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    try {
      await api.uploadFiles('images', e.target.files);
      addLog(`Uploaded ${e.target.files.length} image file(s)`, 'success');
      loadFiles();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addLog(`Upload failed: ${msg}`, 'error');
    }
    e.target.value = '';
  };

  const handleDelete = async (name: string) => {
    try {
      await api.deleteFile('images', name);
      addLog(`Deleted ${name}`, 'success');
      if (selected === name) { setSelected(null); setTags([]); }
      setChecked((prev) => { const n = new Set(prev); n.delete(name); return n; });
      loadFiles();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addLog(`Delete failed: ${msg}`, 'error');
    }
  };

  const handleStore = async () => {
    const filenames = Array.from(checked);
    if (filenames.length === 0) {
      addLog('No files selected for storage', 'error');
      return;
    }
    setStoring(true);
    addLog(`Storing ${filenames.length} image(s) to PACS...`, 'info');
    try {
      const result = await api.storeImages(filenames, selectedWorklist);
      addLog(`Store Image: ${result.message}`, result.success ? 'success' : 'error');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addLog(`Store Image failed: ${msg}`, 'error');
    } finally {
      setStoring(false);
    }
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Selected Worklist Info (if any) */}
      {selectedWorklist ? (
        <div className="glass-card p-3 border-l-4 border-accent bg-accent/5 flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-accent tracking-wider">Active Binding</span>
              <span className="text-sm font-semibold text-text-primary">
                {formatDicomValue(selectedWorklist.PatientName) || 'Anonymous'} ({formatDicomValue(selectedWorklist.PatientID) || 'No ID'})
              </span>
            </div>
            <div className="h-8 w-[1px] bg-border mx-1" />
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider">Accession</span>
              <span className="text-xs font-mono text-text-secondary">{formatDicomValue(selectedWorklist.AccessionNumber) || 'N/A'}</span>
            </div>
            <div className="flex flex-col ml-2">
              <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider">Procedure</span>
              <span className="text-xs text-text-secondary truncate max-w-xs">{formatDicomValue(selectedWorklist.ScheduledProcedureStepSequence?.[0]?.ScheduledProcedureStepDescription) || 'No description'}</span>
            </div>
          </div>
          <button 
            className="btn btn-outline py-1 px-3 text-xs border-danger/30 text-danger hover:bg-danger hover:text-white"
            onClick={() => onSelectWorklist(null)}
          >
            Clear Binding
          </button>
        </div>
      ) : (
        <div className="glass-card p-3 border-l-4 border-yellow-500/30 bg-yellow-500/5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-text-secondary">
            <span className="text-yellow-500">⚠️</span>
            <p className="text-xs">No worklist item selected. Images will be stored without patient data binding.</p>
          </div>
          {setActiveTab && (
            <button 
              className="text-[10px] uppercase font-bold text-accent hover:text-accent-light px-2"
              onClick={() => setActiveTab('worklist')}
            >
              Select Worklist
            </button>
          )}
        </div>
      )}

      <div className="flex gap-4 flex-1 min-h-0">
      {/* File list */}
      <div className="w-72 flex-shrink-0 glass-card flex flex-col">
        <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
          <span className="section-header mb-0 flex-1">Image Files</span>
          <button className="btn btn-outline py-1 px-2 text-xs" onClick={() => fileInput.current?.click()}>
            <FiUpload /> Upload
          </button>
          <input ref={fileInput} type="file" accept=".dcm" multiple hidden onChange={handleUpload} />
        </div>
        <div className="flex-1 overflow-y-auto p-1.5">
          {files.length === 0 ? (
            <p className="text-xs text-text-muted p-3 text-center">No files uploaded</p>
          ) : (
            files.map((f) => (
              <div
                key={f.name}
                className={`file-item group ${selected === f.name ? 'selected' : ''}`}
                onClick={() => handleSelect(f.name)}
              >
                <button
                  className="flex-shrink-0 text-accent-light"
                  onClick={(e) => toggleCheck(f.name, e)}
                  title={checked.has(f.name) ? 'Uncheck' : 'Check for store'}
                >
                  {checked.has(f.name) ? <FiCheckSquare size={15} /> : <FiSquare size={15} />}
                </button>
                <FiFile className="flex-shrink-0" />
                <span className="flex-1 truncate">{f.name}</span>
                <button
                  className="opacity-0 group-hover:opacity-100 text-danger hover:text-danger transition-opacity"
                  onClick={(e) => { e.stopPropagation(); handleDelete(f.name); }}
                  title="Delete"
                >
                  <FiTrash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
        {files.length > 0 && (
          <div className="px-3 py-2.5 border-t border-border">
            <button
              id="btn-store-selected"
              className="btn btn-primary w-full justify-center"
              onClick={handleStore}
              disabled={checked.size === 0 || storing}
            >
              <FiUploadCloud />
              {storing ? 'Storing...' : `Store ${checked.size > 0 ? `(${checked.size})` : ''} to PACS`}
            </button>
          </div>
        )}
      </div>

      {/* Tags viewer */}
      <div className="flex-1 glass-card flex flex-col">
        <div className="px-4 py-2.5 border-b border-border">
          <span className="section-header mb-0">
            {selected ? `DICOM Tags — ${selected}` : 'Select a file to view tags'}
          </span>
        </div>
        <div className="flex-1 overflow-auto">
          {loadingTags ? (
            <p className="text-sm text-text-muted p-4">Loading tags...</p>
          ) : tags.length > 0 ? (
            <table className="dicom-table">
              <thead>
                <tr>
                  <th>Tag</th>
                  <th>Name</th>
                  <th>VR</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {tags.map((t, i) => (
                  <tr key={i}>
                    <td>{t.tag}</td>
                    <td style={{ fontFamily: 'var(--font-sans)' }}>{t.name}</td>
                    <td>{t.vr}</td>
                    <td className="max-w-xs truncate" title={t.value}>{t.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : selected ? (
            <p className="text-sm text-text-muted p-4">No tags found</p>
          ) : (
            <p className="text-sm text-text-muted p-4">Select a file from the list to inspect DICOM tags</p>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
