import { useState, useEffect } from 'react';
import { FiSearch, FiCalendar, FiUser, FiActivity, FiCheckSquare, FiTrash2, FiRadio } from 'react-icons/fi';
import * as api from '../api';

interface Props {
  onQuery: (query: api.WorklistQuery) => void;
  onClear: () => void;
  isLoading: boolean;
  externalQuery?: api.WorklistQuery | null;
  query: api.WorklistQuery;
  setQuery: React.Dispatch<React.SetStateAction<api.WorklistQuery>>;
  mode: 'form' | 'json';
  setMode: React.Dispatch<React.SetStateAction<'form' | 'json'>>;
}

export default function WorklistQueryForm({ 
  onQuery, 
  onClear, 
  isLoading, 
  externalQuery,
  query,
  setQuery,
  mode,
  setMode
}: Props) {
  const initialQuery: api.WorklistQuery = {
    PatientName: '*',
    PatientID: '',
    AccessionNumber: '',
    Modality: '',
    ScheduledProcedureStepStartDate: '',
    ScheduledPerformingPhysicianName: '',
  };

  const [rawJson, setRawJson] = useState('');

  // Update form when external query is provided
  useEffect(() => {
    if (externalQuery) {
      setQuery(prev => ({ ...prev, ...externalQuery }));
      setRawJson(JSON.stringify(externalQuery, null, 2));
    }
  }, [externalQuery, setQuery]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'rawJson') {
      setRawJson(value);
    } else {
      setQuery((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleReset = () => {
    setQuery(initialQuery);
    setRawJson('');
    onClear();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'json') {
      try {
        const parsed = JSON.parse(rawJson);
        onQuery(parsed);
      } catch (err) {
        alert('Invalid JSON: ' + (err instanceof Error ? err.message : 'Unknown error'));
      }
    } else {
      onQuery(query);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between pb-2 border-b border-border/40">
        <div className="flex bg-bg-secondary p-1 rounded-lg border border-border/50">
          <button
            type="button"
            className={`px-4 py-1.5 text-[10px] uppercase font-bold tracking-wider rounded-md transition-all ${mode === 'form' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-text-muted hover:text-text-primary'}`}
            onClick={() => setMode('form')}
          >
            Structured View
          </button>
          <button
            type="button"
            className={`px-4 py-1.5 text-[10px] uppercase font-bold tracking-wider rounded-md transition-all ${mode === 'json' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-text-muted hover:text-text-primary'}`}
            onClick={() => setMode('json')}
          >
            Raw DICOM
          </button>
        </div>
        
        <div className="flex items-center gap-4">
          {externalQuery && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-success/10 border border-success/20 rounded shadow-sm">
              <FiCheckSquare className="text-success" size={12} />
              <span className="text-[10px] text-success uppercase font-bold tracking-tight">Template Loaded</span>
            </div>
          )}
          <button 
            type="button" 
            onClick={handleReset}
            className="group flex items-center gap-1.5 text-[10px] uppercase font-bold text-text-muted hover:text-danger transition-colors"
          >
            <FiTrash2 size={12} className="group-hover:scale-110 transition-transform" />
            <span>Reset Fields</span>
          </button>
        </div>
      </div>

      {mode === 'form' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
          {[
            { name: 'PatientName', label: 'Patient Name', icon: FiUser, placeholder: 'e.g. DOE^JOHN', help: 'Wildcards (*) allowed' },
            { name: 'PatientID', label: 'Patient ID', icon: FiSearch, placeholder: 'Exact unique ID' },
            { name: 'AccessionNumber', label: 'Accession #', icon: FiActivity, placeholder: 'Order number' },
            { name: 'Modality', label: 'Modality', icon: FiRadio, placeholder: 'e.g. MR, CT, DX' },
            { name: 'ScheduledProcedureStepStartDate', label: 'Schedule Date', icon: FiCalendar, placeholder: 'YYYYMMDD' },
            { name: 'ScheduledPerformingPhysicianName', label: 'Physician', icon: FiUser, placeholder: 'Radiologist name' },
          ].map((field) => (
            <div key={field.name} className="space-y-1.5 group">
              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider group-focus-within:text-accent transition-colors flex items-center gap-2">
                <field.icon size={12} className="opacity-70" />
                {field.label}
              </label>
              <div className="relative">
                <input
                  type="text"
                  name={field.name}
                  value={(query as any)[field.name] || ''}
                  onChange={handleChange}
                  className="input py-2 pl-3 pr-8 bg-white/5 border-border/40 focus:border-accent/60 transition-all text-sm"
                  placeholder={field.placeholder}
                />
                {field.help && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[9px] text-text-muted italic pointer-events-none pr-1">
                    {field.help}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2 animate-in fade-in duration-300">
          <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
            <FiActivity size={12} className="text-accent" />
            Full DICOM C-FIND Attributes
          </label>
          <div className="relative group">
            <textarea
              name="rawJson"
              value={rawJson}
              onChange={handleChange}
              className="input font-mono text-xs h-56 w-full py-3 px-4 bg-white/5 border-border/40 focus:border-accent/60 resize-none"
              placeholder='{ "PatientName": "*", ... }'
            />
            <div className="absolute top-2 right-2 text-[9px] font-mono text-text-muted opacity-40 group-hover:opacity-100 transition-opacity">
              JSON FORMAT
            </div>
          </div>
          <p className="text-[10px] text-text-muted flex items-center gap-1.5 opacity-60 italic">
            <span className="text-accent not-italic font-bold">PRO TIP:</span> 
            Sequence overrides will take precedence over structured fields.
          </p>
        </div>
      )}

      <div className="pt-4 flex justify-end">
        <button
          type="submit"
          disabled={isLoading}
          className="btn btn-primary min-w-[200px] justify-center py-2.5 shadow-xl shadow-accent/10 active:scale-95"
        >
          {isLoading ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              <span>SEARCHING...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <FiSearch />
              <span className="font-bold tracking-widest text-xs">QUERY WORKLIST</span>
            </div>
          )}
        </button>
      </div>
    </form>
  );
}
