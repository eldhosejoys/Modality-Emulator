import { useState, useEffect } from 'react';
import { FiSearch, FiCalendar, FiUser, FiActivity } from 'react-icons/fi';
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex bg-bg-secondary p-1 rounded-lg border border-border">
          <button
            type="button"
            className={`px-3 py-1 text-xs rounded-md transition-all ${mode === 'form' ? 'bg-accent text-white shadow-sm' : 'text-text-muted hover:text-text-primary'}`}
            onClick={() => setMode('form')}
          >
            Structured Form
          </button>
          <button
            type="button"
            className={`px-3 py-1 text-xs rounded-md transition-all ${mode === 'json' ? 'bg-accent text-white shadow-sm' : 'text-text-muted hover:text-text-primary'}`}
            onClick={() => setMode('json')}
          >
            Raw JSON
          </button>
        </div>
        <div className="flex items-center gap-3">
          {externalQuery && <span className="text-[10px] text-success italic font-medium">Template Loaded!</span>}
          <button 
            type="button" 
            onClick={handleReset}
            className="text-[10px] uppercase font-bold text-text-muted hover:text-danger transition-colors"
          >
            Reset Form
          </button>
        </div>
      </div>

      {mode === 'form' ? (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-text-muted flex items-center gap-1.5">
              <FiUser size={12} /> Patient Name (Wildcards OK)
            </label>
            <input
              type="text"
              name="PatientName"
              value={query.PatientName}
              onChange={handleChange}
              className="input py-1.5"
              placeholder="e.g. DOE^JOHN or *"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-text-muted flex items-center gap-1.5">
              <FiSearch size={12} /> Patient ID
            </label>
            <input
              type="text"
              name="PatientID"
              value={query.PatientID}
              onChange={handleChange}
              className="input py-1.5"
              placeholder="Exact ID"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-text-muted flex items-center gap-1.5">
              <FiActivity size={12} /> Modality
            </label>
            <input
              type="text"
              name="Modality"
              value={query.Modality}
              onChange={handleChange}
              className="input py-1.5"
              placeholder="e.g. CT, MR, DX"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-text-muted flex items-center gap-1.5">
              <FiCalendar size={12} /> Start Date (YYYYMMDD)
            </label>
            <input
              type="text"
              name="ScheduledProcedureStepStartDate"
              value={query.ScheduledProcedureStepStartDate}
              onChange={handleChange}
              className="input py-1.5"
              placeholder="YYYYMMDD (Empty for all)"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-text-muted flex items-center gap-1.5">
              <FiActivity size={12} /> Station AE Title
            </label>
            <input
              type="text"
              name="ScheduledStationAETitle"
              value={query.ScheduledStationAETitle || ''}
              onChange={handleChange}
              className="input py-1.5"
              placeholder="e.g. MY_MODALITY"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-text-muted flex items-center gap-1.5">
              <FiSearch size={12} /> Accession Number
            </label>
            <input
              type="text"
              name="AccessionNumber"
              value={query.AccessionNumber || ''}
              onChange={handleChange}
              className="input py-1.5"
              placeholder="Order number"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <label className="text-xs font-medium text-text-muted flex items-center gap-1.5">
            <FiActivity size={12} /> Full DICOM Query JSON
          </label>
          <textarea
            name="rawJson"
            value={rawJson}
            onChange={handleChange}
            className="input font-mono text-xs h-48 w-full py-2 resize-none"
            placeholder='{ "PatientName": "*", ... }'
          />
          <p className="text-[10px] text-text-muted mt-1">
            Note: If you include <code>ScheduledProcedureStepSequence</code> here, it will override all other fields.
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isLoading}
          className="btn btn-primary w-full sm:w-auto"
        >
          <FiSearch /> {isLoading ? 'Querying...' : 'Search RIS Worklist'}
        </button>
      </div>
    </form>
  );
}
