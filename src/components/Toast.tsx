import { useEffect, useState } from 'react';
import { FiCheckCircle, FiInfo, FiAlertCircle, FiX } from 'react-icons/fi';

export interface ToastMessage {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error';
  duration?: number;
}

interface ToastProps {
  toast: ToastMessage;
  onClose: (id: number) => void;
}

export default function Toast({ toast, onClose }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);
  const [progress, setProgress] = useState(100);
  const duration = toast.duration || 5000;

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      
      if (elapsed >= duration) {
        clearInterval(interval);
        handleClose();
      }
    }, 10);

    return () => clearInterval(interval);
  }, [toast, duration]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => onClose(toast.id), 300);
  };

  const getIcon = () => {
    switch (toast.type) {
      case 'success': return <FiCheckCircle className="text-success text-xl" />;
      case 'error': return <FiAlertCircle className="text-danger text-xl" />;
      default: return <FiInfo className="text-accent-light text-xl" />;
    }
  };

  const getTypeStyles = () => {
    switch (toast.type) {
      case 'success': return 'border-success/30 bg-success/10 shadow-success/10';
      case 'error': return 'border-danger/30 bg-danger/10 shadow-danger/10';
      default: return 'border-accent/30 bg-accent/10 shadow-accent/10';
    }
  };

  const getProgressColor = () => {
    switch (toast.type) {
      case 'success': return 'bg-success';
      case 'error': return 'bg-danger';
      default: return 'bg-accent';
    }
  };

  return (
    <div 
      className={`
        relative overflow-hidden flex items-start gap-4 p-4 rounded-xl border backdrop-blur-md shadow-lg transition-all duration-300
        ${getTypeStyles()}
        ${isExiting ? 'opacity-0 -translate-y-4 scale-95' : 'opacity-100 translate-y-0 scale-100'}
        animate-slide-down
      `}
      style={{ minWidth: '320px', maxWidth: '420px' }}
    >
      <div className="mt-0.5">{getIcon()}</div>
      <div className="flex-1">
        <p className="text-sm font-medium text-text-primary leading-tight">
          {toast.message}
        </p>
      </div>
      <button 
        onClick={handleClose}
        className="text-text-muted hover:text-text-primary transition-colors p-1"
      >
        <FiX className="text-lg" />
      </button>

      {/* Progress bar */}
      <div className="absolute top-0 left-0 h-0.5 w-full bg-white/5 overflow-hidden">
        <div 
          className={`h-full opacity-60 transition-none ${getProgressColor()}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export function ToastContainer({ toasts, onClose }: { toasts: ToastMessage[], onClose: (id: number) => void }) {
  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-3 pointer-events-none items-center">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast toast={toast} onClose={onClose} />
        </div>
      ))}
    </div>
  );
}
