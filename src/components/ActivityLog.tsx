import { FiTrash2 } from 'react-icons/fi';
import type { LogEntry } from '../App';

interface Props {
  logs: LogEntry[];
  onDelete: (id: number) => void;
}

export default function ActivityLog({ logs, onDelete }: Props) {
  if (logs.length === 0) {
    return (
      <p className="text-xs text-text-muted p-3 text-center">No activity yet</p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {logs.map((log) => (
        <div key={log.id} className={`log-entry group relative ${log.type}`}>
          <span className="opacity-50">[{log.timestamp}]</span> {log.message}
          <button 
            onClick={() => onDelete(log.id)}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-text-muted opacity-0 group-hover:opacity-100 hover:text-danger transition-all"
            title="Delete entry"
          >
            <FiTrash2 size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
