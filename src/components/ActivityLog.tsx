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
    <div className="flex flex-col gap-0.5">
      {logs.map((log) => (
        <div 
          key={log.id} 
          className={`log-entry group relative py-2 pl-3 pr-8 transition-all duration-200 border-l-2 hover:bg-white/5 ${
            log.type === 'success' ? 'border-success/40' : 
            log.type === 'error' ? 'border-danger/40' : 
            'border-accent/30'
          }`}
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-mono opacity-40 uppercase tracking-tighter">
              {log.timestamp}
            </span>
            <span className={`text-[11px] leading-relaxed break-words ${
              log.type === 'success' ? 'text-success/90' : 
              log.type === 'error' ? 'text-danger/90' : 
              'text-text-secondary group-hover:text-text-primary'
            }`}>
              {log.message}
            </span>
          </div>
          <button 
            onClick={() => onDelete(log.id)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-text-muted opacity-0 group-hover:opacity-100 hover:text-danger hover:bg-danger/10 rounded-md transition-all sm:p-1"
            title="Delete log entry"
          >
            <FiTrash2 size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}
