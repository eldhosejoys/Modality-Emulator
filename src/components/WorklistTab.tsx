import { useState, useEffect, useRef } from 'react';
import { FiFile, FiUpload, FiTrash2, FiDatabase, FiList, FiSearch, FiChevronDown, FiChevronUp, FiZap, FiCheckSquare } from 'react-icons/fi';
import * as api from '../api';
import type { LogEntry } from '../App';
import WorklistQueryForm from './WorklistQueryForm';

interface Props {
  addLog: (msg: string, type?: LogEntry['type']) => void;
  selectedWorklist: any | null;
  onSelectWorklist: (worklist: any | null) => void;
}

export default function WorklistTab({ addLog, selectedWorklist, onSelectWorklist }: Props) {
  const [files, setFiles] = useState<api.FileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [tags, setTags] = useState<api.DicomTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [queryResults, setQueryResults] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'local' | 'live'>('live');
  const [externalQuery, setExternalQuery] = useState<api.WorklistQuery | null>(null);
  const [panelStates, setPanelStates] = useState({
    query: true,
    fileList: true
  });
  
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

  const handleUseAsTemplate = async (autoQuery = false) => {
    if (!selectedFile) return;
    
    setLoading(true);
    try {
      const rawData = await api.getFileJson('worklist', selectedFile);
      
      // Build a clean query payload suitable for C-FIND universal matching.
      // The DCM file may contain specific values (e.g. a date like "20060801" inside
      // ScheduledProcedureStepSequence) that were valid for creating the worklist entry
      // but act as restrictive filters when used in a C-FIND query, returning 0 results.
      // We reset date/time fields to "" (universal match) so Orthanc returns all entries.
      const sanitizedSequence = Array.isArray(rawData.ScheduledProcedureStepSequence)
        ? rawData.ScheduledProcedureStepSequence.map((step: any) => ({
            ...step,
            // Reset date/time fields to universal match ("") inside the sequence
            ScheduledProcedureStepStartDate: '',
            ScheduledProcedureStepStartTime: '',
            ScheduledProcedureStepEndDate: '',
            ScheduledProcedureStepEndTime: '',
          }))
        : rawData.ScheduledProcedureStepSequence;

      const queryPayload: api.WorklistQuery = {
        ...rawData,
        // Also reset top-level date fields that may be specific
        ScheduledProcedureStepStartDate: '',
        ScheduledPerformingPhysicianName: rawData.ScheduledPerformingPhysicianName || '',
        // Replace sequence with sanitized version
        ...(sanitizedSequence !== undefined ? { ScheduledProcedureStepSequence: sanitizedSequence } : {}),
      };

      setExternalQuery(queryPayload);
      
      if (autoQuery) {
        addLog('Executing direct query from ' + selectedFile, 'info');
        handleLiveQuery(queryPayload);
      } else {
        setViewMode('live');
        addLog('Loaded actual data from template: ' + selectedFile, 'success');
        setPanelStates(prev => ({ ...prev, query: true }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addLog(`Failed to load template data: ${msg}`, 'error');
    } finally {
      if (!autoQuery) setLoading(false);
    }
  };

  const handleBindLocalTemplate = async () => {
    if (!selectedFile) return;
    setLoading(true);
    try {
      const rawData = await api.getFileJson('worklist', selectedFile);
      onSelectWorklist(rawData);
      addLog(`Bound local template ${selectedFile} as active worklist`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addLog(`Failed to bind template: ${msg}`, 'error');
    } finally {
      setLoading(false);
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
        // Collapse query panel to show results
        setPanelStates(prev => ({ ...prev, query: false }));
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

  const togglePanel = (panel: 'query' | 'fileList') => {
    setPanelStates(prev => ({ ...prev, [panel]: !prev[panel] }));
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Query Panel */}
      <div className="glass-card flex flex-col min-h-0 overflow-hidden transition-all duration-300">
        <div 
          className="p-4 border-b border-border flex items-center justify-between cursor-pointer hover:bg-bg-secondary/50 group"
          onClick={() => togglePanel('query')}
        >
          <div className="flex items-center gap-2">
            <FiDatabase className="text-accent" />
            <h2 className="text-sm font-semibold text-text-primary">Live RIS Worklist Query</h2>
          </div>
          <div className="flex items-center gap-2">
            {!panelStates.query && <span className="text-[10px] text-text-muted px-2 py-0.5 rounded-full bg-bg-secondary">Collapsed</span>}
            {panelStates.query ? <FiChevronUp className="text-text-muted group-hover:text-accent" /> : <FiChevronDown className="text-text-muted group-hover:text-accent" />}
          </div>
        </div>
        
        {panelStates.query && (
          <div className="p-5">
            <WorklistQueryForm 
              onQuery={handleLiveQuery} 
              isLoading={loading && viewMode === 'live'} 
              externalQuery={externalQuery}
            />
          </div>
        )}
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left Sidebar: File List */}
        <div className={`glass-card flex flex-col overflow-hidden transition-all duration-300 ${panelStates.fileList ? 'w-72' : 'w-12'}`}>
          <div 
            className="px-3 py-2.5 border-b border-border flex items-center justify-between cursor-pointer hover:bg-bg-secondary/50"
            onClick={() => togglePanel('fileList')}
          >
            <div className={`flex items-center gap-2 ${!panelStates.fileList && 'hidden'}`}>
              <FiList className="text-text-muted" size={14} />
              <span className="section-header mb-0">Local Templates</span>
            </div>
            {panelStates.fileList ? <FiChevronUp size={14} className="text-text-muted" /> : <FiChevronDown size={14} className="text-text-muted mx-auto" />}
          </div>
          
          {panelStates.fileList && (
            <>
              <div className="p-2 border-b border-border">
                <button className="btn btn-outline py-1 px-2 text-xs w-full" onClick={() => fileInput.current?.click()}>
                  <FiUpload size={12} /> Upload File
                </button>
                <input ref={fileInput} type="file" accept=".dcm" multiple hidden onChange={handleUpload} />
              </div>
              <div className="flex-1 overflow-y-auto p-1.5">
                {files.length === 0 ? (
                  <p className="text-xs text-text-muted p-3 text-center">No files</p>
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
            </>
          )}
        </div>

        {/* Right Content: Results or Inspector */}
        <div className="flex-1 glass-card flex flex-col min-h-0 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex justify-between items-center bg-bg-secondary/30">
            <span className="section-header mb-0 flex items-center gap-2">
              {viewMode === 'live' ? <FiSearch size={14} className="text-accent" /> : <FiFile size={14} className="text-accent" />}
              {viewMode === 'live' ? `Query Results (${queryResults.length})` : `File: ${selectedFile}`}
            </span>
            <div className="flex gap-1.5">
              {viewMode === 'local' && selectedFile && (
                <>
                  <button 
                    className="text-[10px] uppercase font-bold px-2 py-1 rounded border border-success text-success hover:bg-success hover:text-white transition-all flex items-center gap-1"
                    onClick={() => handleUseAsTemplate(true)}
                  >
                    <FiZap size={10} /> Direct Query
                  </button>
                  <button 
                    className="text-[10px] uppercase font-bold px-2 py-1 rounded border border-accent text-accent hover:bg-accent hover:text-white transition-all flex items-center gap-1"
                    onClick={handleBindLocalTemplate}
                  >
                    <FiCheckSquare size={10} /> Bind this Template
                  </button>
                  <button 
                    className="text-[10px] uppercase font-bold px-2 py-1 rounded border border-accent/50 text-text-muted hover:bg-bg-secondary transition-all"
                    onClick={() => handleUseAsTemplate(false)}
                  >
                    To Form
                  </button>
                </>
              )}
              <div className="w-[1px] bg-border mx-1" />
              <button 
                className={`text-[10px] uppercase font-bold px-3 py-1 rounded border transition-all ${viewMode === 'live' ? 'bg-accent text-white border-accent shadow-sm' : 'border-border text-text-muted hover:text-text-primary'}`}
                onClick={() => setViewMode('live')}
              >
                Results
              </button>
              <button 
                className={`text-[10px] uppercase font-bold px-3 py-1 rounded border transition-all ${viewMode === 'local' ? 'bg-accent text-white border-accent shadow-sm' : 'border-border text-text-muted hover:text-text-primary'}`}
                onClick={() => setViewMode('local')}
              >
                Inspector
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-text-muted">Processing request...</p>
              </div>
            ) : viewMode === 'live' ? (
              queryResults.length > 0 ? (
                <div className="p-4 space-y-3">
                  {queryResults.map((res, i) => {
                    const isSelected = selectedWorklist && JSON.stringify(selectedWorklist) === JSON.stringify(res.json);
                    return (
                      <div 
                        key={i} 
                        className={`bg-bg-input rounded-lg border p-3 font-mono text-xs whitespace-pre-wrap overflow-x-auto text-text-secondary group transition-all duration-200 shadow-sm cursor-pointer relative ${isSelected ? 'border-accent ring-1 ring-accent/30 bg-accent/5' : 'border-border hover:border-accent/40'}`}
                        onClick={() => onSelectWorklist(isSelected ? null : res.json)}
                      >
                        <div className="text-accent-light mb-1 font-bold border-b border-border pb-1 flex justify-between items-center">
                          <span>Result #{i + 1}</span>
                          {isSelected && <span className="text-[10px] bg-accent text-white px-2 py-0.5 rounded-full uppercase tracking-wider scale-90 origin-right">Selected</span>}
                        </div>
                        {res.string}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-6 text-text-muted">
                  <FiSearch size={40} className="mb-2 opacity-10" />
                  <p className="text-sm font-medium">No results found</p>
                  <p className="text-xs mt-1">Configure search parameters above or try 'Direct Query' from a template</p>
                </div>
              )
            ) : (
              tags.length > 0 ? (
                <div className="min-w-full inline-block align-middle">
                  <table className="dicom-table w-full">
                    <thead>
                      <tr>
                        <th className="w-24">Tag</th>
                        <th>Name</th>
                        <th className="w-12">VR</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tags.map((t: any, i) => (
                        <tr key={i} className={t.isHeader ? 'bg-bg-secondary/40 font-bold border-y border-border/50' : 'hover:bg-bg-secondary/20'}>
                          <td className="text-[10px] text-text-muted font-mono">{t.tag}</td>
                          <td 
                            style={{ 
                              fontFamily: 'var(--font-sans)',
                              paddingLeft: t.name.includes('>') ? `${(t.name.split('>').length - 1) * 1.25 + 0.75}rem` : '0.75rem'
                            }}
                            className={`${t.isHeader ? 'text-accent' : 'text-text-primary'}`}
                          >
                            {t.name.includes('>') ? (
                              <span className="flex items-center gap-1.5 opacity-80">
                                <span className="text-[10px] text-text-muted">↳</span>
                                {t.name.split('>').pop()?.trim()}
                              </span>
                            ) : t.name}
                          </td>
                          <td className="text-[10px] text-center font-mono opacity-60">{t.vr}</td>
                          <td className={`max-w-md truncate ${t.isHeader ? 'italic text-text-muted text-[10px]' : ''}`} title={t.value}>
                            {t.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-6 text-text-muted">
                  <FiFile size={40} className="mb-2 opacity-10" />
                  <p className="text-sm">No file selected</p>
                  <p className="text-xs mt-1">Select a template from the sidebar to inspect tags or run a direct query</p>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
