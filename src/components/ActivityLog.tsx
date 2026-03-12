import type { LogEntry } from '../App';

interface Props {
  logs: LogEntry[];
}

export default function ActivityLog({ logs }: Props) {
  if (logs.length === 0) {
    return (
      <p className="text-xs text-text-muted p-3 text-center">No activity yet</p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {logs.map((log) => (
        <div key={log.id} className={`log-entry ${log.type}`}>
          <span className="opacity-50">[{log.timestamp}]</span> {log.message}
        </div>
      ))}
    </div>
  );
}
