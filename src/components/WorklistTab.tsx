import { useState, useEffect, useRef } from 'react';
import { FiFile, FiUpload, FiTrash2, FiDatabase, FiList, FiSearch, FiChevronDown, FiChevronUp, FiZap } from 'react-icons/fi';
import * as api from '../api';
import type { LogEntry, TabId } from '../App';
import WorklistQueryForm from './WorklistQueryForm';

interface Props {
  settings: api.Settings;
  addLog: (msg: string, type?: LogEntry['type']) => void;
  selectedWorklist: any | null;
  onSelectWorklist: (worklist: any | null) => void;
  setActiveTab?: (tab: TabId) => void;
  queryResults: any[];
  setQueryResults: (results: any[]) => void;
  viewMode: 'local' | 'live';
  setViewMode: (mode: 'local' | 'live') => void;
  externalQuery: api.WorklistQuery | null;
  setExternalQuery: (query: api.WorklistQuery | null) => void;
  panelStates: { query: boolean; fileList: boolean };
  setPanelStates: React.Dispatch<React.SetStateAction<{ query: boolean; fileList: boolean }>>;
  query: api.WorklistQuery;
  setQuery: React.Dispatch<React.SetStateAction<api.WorklistQuery>>;
  formMode: 'form' | 'json';
  setFormMode: React.Dispatch<React.SetStateAction<'form' | 'json'>>;
}

export default function WorklistTab({ 
  settings,
  addLog, 
  selectedWorklist, 
  onSelectWorklist,
  queryResults,
  setQueryResults,
  viewMode,
  setViewMode,
  externalQuery,
  setExternalQuery,
  panelStates,
  setPanelStates,
  query,
  setQuery,
  formMode,
  setFormMode,
  setActiveTab
}: Props) {
  const [files, setFiles] = useState<api.FileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [tags, setTags] = useState<api.DicomTag[]>([]);
  const [currentJson, setCurrentJson] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [targetRisId, setTargetRisId] = useState<string>(settings.selectedRisId || settings.ris[0]?.id || '');
  
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings.selectedRisId && !targetRisId) {
      setTargetRisId(settings.selectedRisId);
    }
  }, [settings.selectedRisId]);

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
    setEditingIndex(null);
    try {
      const [parsed, json] = await Promise.all([
        api.parseFile('worklist', name),
        api.getFileJson('worklist', name)
      ]);
      setTags(parsed);
      setCurrentJson(json);
      setViewMode('local');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addLog(`Failed to parse ${name}: ${msg}`, 'error');
      setTags([]);
      setCurrentJson(null);
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
      if (selectedFile === name) { setSelectedFile(null); setTags([]); setCurrentJson(null); }
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
      // Use currentJson if available, otherwise fetch
      const rawData = currentJson || await api.getFileJson('worklist', selectedFile);
      
      const sanitizedSequence = Array.isArray(rawData.ScheduledProcedureStepSequence)
        ? rawData.ScheduledProcedureStepSequence.map((step: any) => ({
            ...step,
            ScheduledProcedureStepStartDate: step.ScheduledProcedureStepStartDate || '',
            ScheduledProcedureStepStartTime: step.ScheduledProcedureStepStartTime || '',
            ScheduledProcedureStepEndDate: step.ScheduledProcedureStepEndDate || '',
            ScheduledProcedureStepEndTime: step.ScheduledProcedureStepEndTime || '',
          }))
        : rawData.ScheduledProcedureStepSequence;

      const queryPayload: api.WorklistQuery = {
        ...rawData,
        ScheduledProcedureStepStartDate: rawData.ScheduledProcedureStepStartDate || '',
        ScheduledPerformingPhysicianName: rawData.ScheduledPerformingPhysicianName || '',
        ...(sanitizedSequence !== undefined ? { ScheduledProcedureStepSequence: sanitizedSequence } : {}),
      };

      setExternalQuery(queryPayload);
      
      if (autoQuery) {
        addLog('Executing direct query from ' + (currentJson ? 'edited session data' : selectedFile), 'info');
        handleLiveQuery(queryPayload);
      } else {
        setViewMode('live');
        addLog('Loaded actual data from ' + (currentJson ? 'edited ' : '') + 'template: ' + selectedFile, 'success');
        setPanelStates(prev => ({ ...prev, query: true }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addLog(`Failed to load template data: ${msg}`, 'error');
    } finally {
      if (!autoQuery) setLoading(false);
    }
  };

  const handleUpdateTag = (index: number) => {
    if (editingIndex === null) return;
    
    const tag = tags[index];
    const newTags = [...tags];
    newTags[index] = { ...tag, value: editValue };
    setTags(newTags);
    
    // Update currentJson by parsing the "name" as path
    if (currentJson) {
      const updatedJson = { ...currentJson };
      const pathParts = tag.name.split(' > ');
      let current = updatedJson;
      
      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        const arrayMatch = part.match(/(.+) \[(\d+)\]/);
        
        if (arrayMatch) {
          const key = arrayMatch[1];
          const idx = parseInt(arrayMatch[2]);
          if (i === pathParts.length - 1) {
            current[key][idx] = editValue;
          } else {
            current = current[key][idx];
          }
        } else {
          if (i === pathParts.length - 1) {
            current[part] = editValue;
          } else {
            if (!current[part]) current[part] = {};
            current = current[part];
          }
        }
      }
      setCurrentJson(updatedJson);
    }
    
    setEditingIndex(null);
  };
  const handleLiveQuery = async (query: api.WorklistQuery) => {
    setLoading(true);
    setQueryResults([]);
    try {
      const result = await api.requestWorklist(query, targetRisId);
      if (result.success) {
        setQueryResults(result.data as any[] || []);
        addLog(`Worklist query successful: Found ${result.data ? (result.data as any[]).length : 0} results`, 'success');
        setViewMode('live');
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
        >
          <div className="flex items-center gap-6" onClick={() => togglePanel('query')}>
            <div className="flex items-center gap-2">
              <FiDatabase className="text-accent" />
              <h2 className="text-sm font-semibold text-text-primary">Live RIS Worklist Query</h2>
            </div>
            
            <div className="h-4 w-px bg-border" />
            
            <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Target RIS:</label>
              <select 
                className="bg-bg-secondary border border-border/50 rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent/50"
                value={targetRisId}
                onChange={(e) => setTargetRisId(e.target.value)}
              >
                {settings.ris.map(r => (
                  <option key={r.id} value={r.id}>{r.name} ({r.aeTitle})</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2" onClick={() => togglePanel('query')}>
            {!panelStates.query && <span className="text-[10px] text-text-muted px-2 py-0.5 rounded-full bg-bg-secondary">Collapsed</span>}
            {panelStates.query ? <FiChevronUp className="text-text-muted group-hover:text-accent" /> : <FiChevronDown className="text-text-muted group-hover:text-accent" />}
          </div>
        </div>
        
        {panelStates.query && (
          <div className="p-5">
            <WorklistQueryForm 
              onQuery={handleLiveQuery} 
              onClear={() => { setQueryResults([]); setExternalQuery(null); }}
              isLoading={loading && viewMode === 'live'} 
              externalQuery={externalQuery}
              query={query}
              setQuery={setQuery}
              mode={formMode}
              setMode={setFormMode}
            />
          </div>
        )}
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left Sidebar: File List */}
        <div className="w-72 flex-shrink-0 glass-card flex flex-col overflow-hidden">
          <div className="px-4 py-3.5 border-b border-border flex items-center justify-between bg-bg-secondary/40 backdrop-blur-sm">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold uppercase tracking-wider text-text-primary/90 leading-none">Local Templates</span>
              <span className="text-[10px] text-text-muted font-medium mt-1 flex items-center gap-1">
                <FiList size={10} className="text-accent/60" />
                {files.length} available
              </span>
            </div>
            <button type="button" className="btn btn-outline py-1.5 px-3 text-[10px] h-7 gap-1.5 border-border/40 hover:border-accent/40 bg-white/5" onClick={() => fileInput.current?.click()}>
              <FiUpload className="text-accent" size={12} /> 
              <span>UPLOAD</span>
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
                  <FiFile className={`flex-shrink-0 transition-colors ${selectedFile === f.name && viewMode === 'local' ? 'text-accent' : 'text-text-muted'}`} size={16} />
                  <span className={`flex-1 truncate transition-all ${selectedFile === f.name && viewMode === 'local' ? 'font-semibold text-text-primary' : 'text-text-secondary group-hover:text-text-primary'}`}>{f.name}</span>
                  <button
                    type="button"
                    className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger transition-all p-1.5 hover:bg-danger/10 rounded-md"
                    onClick={(e) => { e.stopPropagation(); handleDelete(f.name); }}
                    title="Delete"
                  >
                    <FiTrash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
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
                    type="button"
                    className="text-[10px] uppercase font-bold px-2 py-1 rounded border border-success text-success hover:bg-success hover:text-white transition-all flex items-center gap-1"
                    onClick={() => handleUseAsTemplate(true)}
                  >
                    <FiZap size={10} /> Direct Query
                  </button>
                  <button 
                    type="button"
                    className="text-[10px] uppercase font-bold px-2 py-1 rounded border border-accent/50 text-text-muted hover:bg-bg-secondary transition-all"
                    onClick={() => handleUseAsTemplate(false)}
                  >
                    To Form
                  </button>
                </>
              )}
              <div className="w-[1px] bg-border mx-1" />
              <button 
                type="button"
                className={`text-[10px] uppercase font-bold px-3 py-1 rounded border transition-all ${viewMode === 'live' ? 'bg-accent text-white border-accent shadow-sm' : 'border-border text-text-muted hover:text-text-primary'}`}
                onClick={() => setViewMode('live')}
              >
                Results
              </button>
              <button 
                type="button"
                className={`text-[10px] uppercase font-bold px-3 py-1 rounded border transition-all ${viewMode === 'local' ? 'bg-accent text-white border-accent shadow-sm' : 'border-border text-text-muted hover:text-text-primary'}`}
                onClick={() => setViewMode('local')}
              >
                Inspector
              </button>
              {queryResults.length > 0 && viewMode === 'live' && (
                <button 
                  type="button"
                  className="text-[10px] uppercase font-bold px-2 py-1 text-danger hover:bg-danger/10 rounded transition-all ml-1"
                  onClick={() => setQueryResults([])}
                >
                  Clear
                </button>
              )}
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
                          {isSelected && (
                            <div className="flex items-center gap-3">
                              <p className="text-[10px] text-text-muted italic animate-pulse">
                                Worklist selected! Switch to <span className="text-accent underline cursor-pointer" onClick={(e) => { e.stopPropagation(); setActiveTab?.('storage'); }}>Image Storage</span> to bind and send images.
                              </p>
                              {setActiveTab && (
                                <button 
                                  type="button"
                                  className="text-[9px] bg-success/20 text-success hover:bg-success hover:text-white px-2 py-0.5 rounded transition-all flex items-center gap-1"
                                  onClick={(e) => { e.stopPropagation(); setActiveTab('storage'); }}
                                >
                                  <FiZap size={8} /> Bind & Send Images
                                </button>
                              )}
                              <span className="text-[10px] bg-accent text-white px-2 py-0.5 rounded-full uppercase tracking-wider scale-90 origin-right">Selected</span>
                            </div>
                          )}
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
                            {!t.isHeader && (t.vr !== 'SQ') ? (
                              editingIndex === i ? (
                                <input
                                  autoFocus
                                  className="bg-bg-input border border-accent rounded px-1 w-full text-text-primary outline-none focus:ring-1 ring-accent/50"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={() => handleUpdateTag(i)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleUpdateTag(i);
                                    if (e.key === 'Escape') setEditingIndex(null);
                                  }}
                                />
                              ) : (
                                <div 
                                  className="cursor-text hover:bg-accent/10 min-h-[1.2rem] px-1 rounded transition-colors group/edit relative"
                                  onClick={() => { setEditingIndex(i); setEditValue(t.value); }}
                                >
                                  {t.value || <span className="text-text-muted/30 italic">empty</span>}
                                  <span className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/edit:opacity-30 text-[9px] uppercase font-bold text-accent">edit</span>
                                </div>
                              )
                            ) : (
                              t.value
                            )}
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
