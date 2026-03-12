import { useState } from 'react';
import { FiSearch, FiCalendar, FiUser, FiActivity } from 'react-icons/fi';
import * as api from '../api';

interface Props {
  onQuery: (query: api.WorklistQuery) => void;
  isLoading: boolean;
}

export default function WorklistQueryForm({ onQuery, isLoading }: Props) {
  const [query, setQuery] = useState<api.WorklistQuery>({
    PatientName: '*',
    PatientID: '',
    AccessionNumber: '',
    Modality: '',
    ScheduledProcedureStepStartDate: new Date().toISOString().split('T')[0].replace(/-/g, ''),
    ScheduledPerformingPhysicianName: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setQuery((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onQuery(query);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
            placeholder="YYYYMMDD"
          />
        </div>
      </div>

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
