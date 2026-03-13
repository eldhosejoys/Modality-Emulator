import { useState, useEffect, useRef, useMemo } from 'react';
import { FiFile, FiUpload, FiTrash2, FiUploadCloud, FiCheckSquare, FiSquare, FiRotateCcw, FiExternalLink } from 'react-icons/fi';
import * as api from '../api';
import type { LogEntry, TabId } from '../App';

interface Props {
  settings: api.Settings;
  addLog: (msg: string, type?: LogEntry['type']) => void;
  selectedWorklist: any | null;
  onSelectWorklist: (worklist: any | null) => void;
  setActiveTab?: (tab: TabId) => void;
}

export default function ImageStorageTab({ settings, addLog, selectedWorklist, onSelectWorklist, setActiveTab }: Props) {
  const [files, setFiles] = useState<api.FileInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [originalTags, setOriginalTags] = useState<api.DicomTag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [storing, setStoring] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [currentJson, setCurrentJson] = useState<any>(null);
  const [modifiedFiles, setModifiedFiles] = useState<Record<string, any>>({});
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [targetPacsId, setTargetPacsId] = useState<string>(settings.selectedPacsId || settings.pacs[0]?.id || '');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings.selectedPacsId && !targetPacsId) {
      setTargetPacsId(settings.selectedPacsId);
    }
  }, [settings.selectedPacsId]);

  // No manual trigger needed for worklist change; useMemo will handle it
  // useEffect(() => { if (selected) handleSelect(selected); }, [selectedWorklist]);

  // Helper to format DICOM values (handles strings vs complex objects like PN)
  const formatDicomValue = (val: any): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return String(val);
    
    // Handle arrays (sequences or multi-value fields)
    if (Array.isArray(val)) {
      if (val.length === 0) return '';
      // Special case: Person Name (PN) sequence structure [{Alphabetic: '...'}]
      if (typeof val[0] === 'object' && val[0] !== null && 'Alphabetic' in val[0]) {
        return val[0].Alphabetic;
      }
      return val.map(v => typeof v === 'object' ? JSON.stringify(v) : v).join('\\');
    }
    
    // Handle objects
    if (typeof val === 'object' && val !== null) {
      if (val.Alphabetic) return val.Alphabetic;
      return JSON.stringify(val);
    }
    return String(val);
  };

  const getValueFromPath = (obj: any, path: string) => {
    if (!obj) return undefined;
    const parts = path.split(' > ');
    let current = obj;
    for (const part of parts) {
      const arrayMatch = part.match(/(.+) \[(\d+)\]/);
      if (arrayMatch) {
         const key = arrayMatch[1];
         const index = parseInt(arrayMatch[2]);
         if (!current || !current[key] || !Array.isArray(current[key]) || !current[key][index]) return undefined;
         current = current[key][index];
      } else {
         if (!current || typeof current !== 'object' || !(part in current)) return undefined;
         current = current[part];
      }
    }
    return current;
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

  const tags = useMemo(() => {
    try {
      if (!selected || originalTags.length === 0) return [];
      
      const fileModifications = modifiedFiles[selected] || {};
      
      return originalTags.map(t => {
        if (t.isHeader || t.vr === 'SQ') return { ...t, source: 'original' as const };
        
        const manualVal = getValueFromPath(fileModifications, t.name);
        const originalVal = t.value || "";
        
        let worklistVal: string | undefined = undefined;
        if (selectedWorklist) {
          const binding: Record<string, any> = {
            'PatientName': selectedWorklist.PatientName,
            'PatientID': selectedWorklist.PatientID,
            'PatientBirthDate': selectedWorklist.PatientBirthDate,
            'PatientSex': selectedWorklist.PatientSex,
            'AccessionNumber': selectedWorklist.AccessionNumber,
            'StudyInstanceUID': selectedWorklist.StudyInstanceUID,
            'ReferringPhysicianName': selectedWorklist.ReferringPhysicianName,
            'Modality': selectedWorklist.ScheduledProcedureStepSequence?.[0]?.Modality || selectedWorklist.Modality,
            'StudyDescription': selectedWorklist.ScheduledProcedureStepSequence?.[0]?.ScheduledProcedureStepDescription || selectedWorklist.StudyDescription,
          };
          
          if (t.name in binding && binding[t.name] !== undefined && binding[t.name] !== null) {
            worklistVal = formatDicomValue(binding[t.name]);
          } else if (t.name.match(/PatientName.*Alphabetic/i) && selectedWorklist.PatientName) {
            worklistVal = formatDicomValue(selectedWorklist.PatientName);
          }
        }

        if (manualVal !== undefined) {
          const formattedManual = formatDicomValue(manualVal);
          if (formattedManual === originalVal) {
             return { ...t, value: originalVal, source: (worklistVal !== undefined ? 'unbound' : 'original') as any };
          }
          return { ...t, value: formattedManual, source: 'manual' as any };
        }
        
        if (worklistVal !== undefined) {
          return { ...t, value: worklistVal, source: 'worklist' as any };
        }
        
        return { ...t, value: originalVal, source: 'original' as any };
      });
    } catch (e) {
      console.error("Error computing tags", e);
      return [];
    }
  }, [originalTags, modifiedFiles, selected, selectedWorklist]);

  const handleSelect = async (name: string) => {
    setSelected(name);
    setLoadingTags(true);
    setEditingIndex(null);
    try {
      const [parsed, json] = await Promise.all([
        api.parseFile('images', name),
        api.getFileJson('images', name)
      ]);
      setOriginalTags(parsed);
      setCurrentJson(json);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addLog(`Failed to parse ${name}: ${msg}`, 'error');
      setOriginalTags([]);
      setCurrentJson(null);
    } finally {
      setLoadingTags(false);
    }
  };

  const handleUpdateTag = (index: number) => {
    if (editingIndex === null || !selected) return;
    
    const tag = tags[index];
    
    setModifiedFiles(prev => {
      try {
        const next = JSON.parse(JSON.stringify(prev));
        if (!next[selected]) next[selected] = {};
        
        const pathParts = tag.name.split(' > ');
        let current = next[selected];
        
        for (let i = 0; i < pathParts.length; i++) {
          const part = pathParts[i];
          const arrayMatch = part.match(/(.+) \[(\d+)\]/);
          
          if (arrayMatch) {
            const key = arrayMatch[1];
            const idx = parseInt(arrayMatch[2]);
            if (i === pathParts.length - 1) {
              if (!current[key]) current[key] = [];
              current[key][idx] = editValue;
            } else {
              if (!current[key]) current[key] = [];
              if (!current[key][idx] || typeof current[key][idx] !== 'object') current[key][idx] = {};
              current = current[key][idx];
            }
          } else {
            if (i === pathParts.length - 1) {
              current[part] = editValue;
            } else {
              if (!current[part] || typeof current[part] !== 'object') current[part] = {};
              current = current[part];
            }
          }
        }
        return next;
      } catch (e) {
        console.error("Failed to update modified files", e);
        return prev;
      }
    });
    
    setEditingIndex(null);
  };

  const handleResetTag = (index: number) => {
    try {
      if (!selected || !currentJson || !tags[index]) return;
      const tag = tags[index];
      const pathParts = tag.name.split(' > ');

      setModifiedFiles(prev => {
        try {
          const next = JSON.parse(JSON.stringify(prev));
          if (!next[selected]) next[selected] = {};
          let current = next[selected];

          if (tag.source === 'manual' || tag.source === 'unbound') {
            for (let i = 0; i < pathParts.length; i++) {
              const part = pathParts[i];
              const arrayMatch = part.match(/(.+) \[(\d+)\]/);
              if (arrayMatch) {
                const key = arrayMatch[1];
                const idx = parseInt(arrayMatch[2]);
                if (i === pathParts.length - 1) {
                  if (current && current[key]) delete current[key][idx];
                } else {
                  if (!current || !current[key] || !current[key][idx]) break;
                  current = current[key][idx];
                }
              } else {
                if (i === pathParts.length - 1) {
                  if (current) delete current[part];
                } else {
                  if (!current || !current[part]) break;
                  current = current[part];
                }
              }
            }
          } else if (tag.source === 'worklist') {
            const originalValue = getValueFromPath(currentJson, tag.name);
            const valToSet = originalValue === undefined ? "" : formatDicomValue(originalValue);
            
            for (let i = 0; i < pathParts.length; i++) {
              const part = pathParts[i];
              const arrayMatch = part.match(/(.+) \[(\d+)\]/);
              if (arrayMatch) {
                const key = arrayMatch[1];
                const idx = parseInt(arrayMatch[2]);
                if (i === pathParts.length - 1) {
                  if (!current[key]) current[key] = [];
                  current[key][idx] = valToSet;
                } else {
                  if (!current[key]) current[key] = [];
                  if (!current[key][idx] || typeof current[key][idx] !== 'object') current[key][idx] = {};
                  current = current[key][idx];
                }
              } else {
                if (i === pathParts.length - 1) {
                  current[part] = valToSet;
                } else {
                  if (!current[part] || typeof current[part] !== 'object') current[part] = {};
                  current = current[part];
                }
              }
            }
          }
          return next;
        } catch (e) {
          console.error("Reset inner failed", e);
          return prev;
        }
      });
    } catch (err) {
      console.error("Reset outer failed", err);
    }
  };

  const handleResetAll = () => {
    if (!window.confirm('Clear all local DICOM modifications?')) return;
    setModifiedFiles({});
    if (selected) {
       // Just refresh original tags if needed, but setModifiedFiles already triggers UI update
       handleSelect(selected);
    }
    addLog('Reset all local DICOM modifications', 'info');
  };

  const toggleCheck = (name: string, index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Select for tags anyway when toggling check
    handleSelect(name);

    if (e.shiftKey && lastClickedIndex !== null) {
      const start = Math.min(lastClickedIndex, index);
      const end = Math.max(lastClickedIndex, index);
      const namesInRange = files.slice(start, end + 1).map(f => f.name);
      
      setChecked(prev => {
        const next = new Set(prev);
        // If we are shift-clicking, we usually want to make sure all are checked
        // unless the first one clicked in this range was checked, then maybe toggle?
        // Standard behavior: check all in range.
        namesInRange.forEach(n => next.add(n));
        return next;
      });
    } else {
      setChecked((prev) => {
        const next = new Set(prev);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        return next;
      });
    }
    setLastClickedIndex(index);
  };

  const toggleAll = () => {
    if (checked.size === files.length && files.length > 0) {
      setChecked(new Set());
    } else {
      setChecked(new Set(files.map(f => f.name)));
    }
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
      if (selected === name) { setSelected(null); setOriginalTags([]); }
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
    const targetPacs = settings.pacs.find(p => p.id === targetPacsId);
    const pacsName = targetPacs ? targetPacs.name : 'PACS';

    setStoring(true);
    addLog(`Storing ${filenames.length} image(s) to ${pacsName}...`, 'info');
    try {
      // Filter modifications to only include checked files
      const relevantOverrides: Record<string, any> = {};
      filenames.forEach(f => {
        if (modifiedFiles[f]) relevantOverrides[f] = modifiedFiles[f];
      });

      const result = await api.storeImages(filenames, targetPacsId, selectedWorklist, relevantOverrides);
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
            type="button"
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
              type="button"
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
        <div className="px-4 py-3.5 border-b border-border flex items-center justify-between bg-bg-secondary/40 backdrop-blur-sm">
          <div className="flex items-center gap-3.5">
            {files.length > 0 && (
              <button 
                type="button"
                className="group/all flex-shrink-0"
                onClick={toggleAll}
                title={checked.size === files.length ? "Deselect All" : "Select All"}
              >
                <div className={`checkbox-custom ${checked.size === files.length ? 'checked' : ''} group-hover/all:border-accent-light`}>
                  {checked.size === files.length && <FiCheckSquare size={12} />}
                  {checked.size > 0 && checked.size < files.length && <div className="w-2 h-0.5 bg-accent-light rounded-full" />}
                </div>
              </button>
            )}
            <div className="flex flex-col">
              <span className="text-[11px] font-bold uppercase tracking-wider text-text-primary/90 leading-none">Image Files</span>
              {files.length > 0 && (
                <span className="text-[10px] text-accent/70 font-semibold mt-1 flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-accent/40" />
                  {checked.size} selected
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-outline py-1.5 px-3 text-[10px] h-7 gap-1.5 border-border/40 hover:border-accent/40 bg-white/5" onClick={() => fileInput.current?.click()}>
              <FiUpload className="text-accent" size={12} /> 
              <span>UPLOAD</span>
            </button>
          </div>
          <input ref={fileInput} type="file" accept=".dcm" multiple hidden onChange={handleUpload} />
        </div>
        <div className="flex-1 overflow-y-auto p-1.5">
          {files.length === 0 ? (
            <p className="text-xs text-text-muted p-3 text-center">No files uploaded</p>
          ) : (
            files.map((f, i) => (
              <div
                key={f.name}
                className={`file-item group ${selected === f.name ? 'selected' : ''} ${checked.has(f.name) ? 'checked' : ''}`}
                onClick={(e) => toggleCheck(f.name, i, e)}
              >
                <div className={`checkbox-custom ${checked.has(f.name) ? 'checked' : ''}`}>
                  {checked.has(f.name) && <FiCheckSquare size={12} />}
                </div>
                <div className="relative">
                  <FiFile className={`flex-shrink-0 transition-colors ${checked.has(f.name) ? 'text-accent' : 'text-text-muted'}`} size={16} />
                  {modifiedFiles[f.name] && <div className="absolute -top-1 -right-1 w-2 h-2 bg-accent rounded-full border-2 border-bg-primary" title="Has modifications" />}
                </div>
                <span className={`flex-1 truncate transition-all ${checked.has(f.name) ? 'font-semibold text-text-primary' : 'text-text-secondary group-hover:text-text-primary'}`}>{f.name}</span>
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
        {files.length > 0 && (
          <div className="px-3 py-3 border-t border-border space-y-3 bg-bg-secondary/20">
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-text-muted uppercase tracking-wider px-1">Target Destination</label>
              <select 
                className="bg-bg-input border border-border/50 rounded-lg w-full px-3 py-2 text-xs text-text-primary outline-none focus:border-accent/50 transition-all font-medium"
                value={targetPacsId}
                onChange={(e) => setTargetPacsId(e.target.value)}
              >
                {settings.pacs.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.aeTitle})</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              id="btn-store-selected"
              className="btn btn-primary w-full justify-center h-10"
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
        <div className="px-4 py-2.5 border-b border-border flex justify-between items-center">
          <span className="section-header mb-0">
            {selected ? `DICOM Tags — ${selected}` : 'Select a file to view tags'}
          </span>
          {Object.keys(modifiedFiles).length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-[10px] bg-accent/20 text-accent font-bold px-2 py-0.5 rounded-full">
                {Object.keys(modifiedFiles).length} Persisted Modification(s)
              </span>
              <button 
                type="button"
                className="text-[10px] text-danger hover:underline font-bold uppercase"
                onClick={handleResetAll}
              >
                Reset All
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-auto">
          {loadingTags ? (
            <p className="text-sm text-text-muted p-4">Loading tags...</p>
          ) : tags.length > 0 ? (
            <table className="dicom-table">
              <thead>
                <tr>
                  <th className="w-24">Tag</th>
                  <th>Name</th>
                  <th className="w-12">VR</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {tags.map((t, i) => (
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
                            className={`cursor-text hover:bg-accent/10 min-h-[1.2rem] px-1 rounded transition-colors group/edit relative ${t.source === 'manual' ? 'text-accent font-medium' : t.source === 'worklist' ? 'text-success italic' : ''}`}
                            onClick={() => { setEditingIndex(i); setEditValue(t.value); }}
                          >
                            {t.value || <span className="text-text-muted/30 italic">empty</span>}
                            {t.source === 'worklist' && <span className="ml-1.5 text-[8px] px-1 rounded bg-success/10 border border-success/20 not-italic font-bold">WORKLIST</span>}
                            {t.source === 'manual' && <span className="ml-1.5 text-[8px] px-1 rounded bg-accent/10 border border-accent/20 font-bold">EDITED</span>}
                            {t.source === 'unbound' && <span className="ml-1.5 text-[8px] px-1 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-500/80 font-bold">ORIGINAL</span>}
                            <span className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/edit:opacity-30 text-[9px] uppercase font-bold text-accent">edit</span>
                            
                            {t.source !== 'original' && (
                              <button 
                                type="button"
                                className="absolute right-10 top-1/2 -translate-y-1/2 opacity-0 group-hover/edit:opacity-100 p-1.5 hover:text-accent transition-all bg-bg-primary rounded-md border border-border/50 shadow-md z-10"
                                onClick={(e) => { 
                                  e.preventDefault();
                                  e.stopPropagation(); 
                                  handleResetTag(i); 
                                }}
                                title="Reset to Original"
                              >
                                <FiRotateCcw size={12} />
                              </button>
                            )}
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
