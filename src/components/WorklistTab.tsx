import { useState, useEffect, useRef } from 'react';
import { FiFile, FiUpload, FiTrash2, FiDatabase, FiList, FiSearch } from 'react-icons/fi';
import * as api from '../api';
import type { LogEntry } from '../App';
import WorklistQueryForm from './WorklistQueryForm';

interface Props {
  addLog: (msg: string, type?: LogEntry['type']) => void;
}

export default function WorklistTab({ addLog }: Props) {
  const [files, setFiles] = useState<api.FileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [tags, setTags] = useState<api.DicomTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [queryResults, setQueryResults] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'local' | 'live'>('live');
  const fileInput = useRef<HTMLInputElement>(null);

  const loadFiles = async () => {
    try {
      const list = await api.listFiles('worklist');
      setFiles(list);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addLog(`Failed to load worklist files: ${msg}`, 'error');
    }
  };

  useEffect(() => { loadFiles(); }, []);

  const handleSelectFile = async (name: string) => {
    setSelectedFile(name);
    setLoading(true);
    try {
      const parsed = await api.parseFile('worklist', name);
      setTags(parsed);
      setViewMode('local');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addLog(`Failed to parse ${name}: ${msg}`, 'error');
      setTags([]);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    try {
      await api.uploadFiles('worklist', e.target.files);
      addLog(`Uploaded ${e.target.files.length} worklist file(s)`, 'success');
      loadFiles();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addLog(`Upload failed: ${msg}`, 'error');
    }
    e.target.value = '';
  };

  const handleDelete = async (name: string) => {
    try {
      await api.deleteFile('worklist', name);
      addLog(`Deleted ${name}`, 'success');
      if (selectedFile === name) { setSelectedFile(null); setTags([]); }
      loadFiles();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addLog(`Delete failed: ${msg}`, 'error');
    }
  };

  const handleLiveQuery = async (query: api.WorklistQuery) => {
    setLoading(true);
    setQueryResults([]);
    try {
      const result = await api.requestWorklist(query);
      if (result.success) {
        setQueryResults(result.data as any[] || []);
        addLog(`Worklist query successful: Found ${result.data ? (result.data as any[]).length : 0} results`, 'success');
        setViewMode('live');
      } else {
        addLog(`Worklist query failed: ${result.message}`, 'error');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addLog(`Worklist query failed: ${msg}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Top Section: Query Form */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <FiDatabase className="text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">Live RIS Worklist Query</h2>
        </div>
        <WorklistQueryForm onQuery={handleLiveQuery} isLoading={loading && viewMode === 'live'} />
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left: Local Files List */}
        <div className="w-68 flex-shrink-0 glass-card flex flex-col">
          <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FiList className="text-text-muted" size={14} />
              <span className="section-header mb-0">Local Template Files</span>
            </div>
            <button className="btn btn-outline py-1 px-2 text-xs" onClick={() => fileInput.current?.click()}>
              <FiUpload size={12} /> Upload
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
                  className={`file-item group ${selectedFile === f.name && viewMode === 'local' ? 'selected' : ''}`}
                  onClick={() => handleSelectFile(f.name)}
                >
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
        </div>

        {/* Right: Results Display */}
        <div className="flex-1 glass-card flex flex-col min-h-0 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex justify-between items-center">
            <span className="section-header mb-0">
              {viewMode === 'live' ? `Query Results (${queryResults.length})` : `Local File Tags: ${selectedFile}`}
            </span>
            <div className="flex gap-2">
              <button 
                className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${viewMode === 'live' ? 'bg-accent text-white border-accent' : 'border-border text-text-muted'}`}
                onClick={() => setViewMode('live')}
              >
                Live Results
              </button>
              <button 
                className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${viewMode === 'local' ? 'bg-accent text-white border-accent' : 'border-border text-text-muted'}`}
                onClick={() => setViewMode('local')}
              >
                File Inspector
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-text-muted animate-pulse">Processing request...</p>
              </div>
            ) : viewMode === 'live' ? (
              queryResults.length > 0 ? (
                <div className="p-4 space-y-3">
                  {queryResults.map((res, i) => (
                    <div key={i} className="bg-bg-input rounded-lg border border-border p-3 font-mono text-xs whitespace-pre-wrap overflow-x-auto text-text-secondary">
                      <div className="text-accent-light mb-1 font-bold border-b border-border pb-1 flex justify-between">
                        <span>Result #{i + 1}</span>
                      </div>
                      {res}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-6 text-text-muted">
                  <FiSearch size={40} className="mb-2 opacity-20" />
                  <p className="text-sm">No results to display</p>
                  <p className="text-xs mt-1">Configure parameters above and click Search RIS Worklist</p>
                </div>
              )
            ) : (
              tags.length > 0 ? (
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
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-6 text-text-muted">
                  <FiFile size={40} className="mb-2 opacity-20" />
                  <p className="text-sm">No file selected</p>
                  <p className="text-xs mt-1">Select a local template file to inspect its tags</p>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
