import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';
import useStore from '../../store/useStore';

const icons = {
  success: <CheckCircle2 size={18} className="text-success" aria-hidden="true" />,
  error: <AlertCircle size={18} className="text-danger" aria-hidden="true" />,
  warning: <AlertTriangle size={18} className="text-warning" aria-hidden="true" />,
  info: <Info size={18} className="text-accent-ink" aria-hidden="true" />,
};

/**
 * Notifications. The region is always mounted as one polite live region, so screen readers
 * announce each new message exactly once.
 */
const ToastContainer = () => {
  const toasts = useStore((s) => s.toasts);
  const removeToast = useStore((s) => s.removeToast);

  return (
    <div className="toast-region" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast">
          <span className="mt-px">{icons[toast.type] || icons.info}</span>
          <div className="flex-1 min-w-0">
            {toast.title && <p className="text-sm font-semibold text-ink">{toast.title}</p>}
            <p className="text-sm text-ink-2 break-words">{toast.message}</p>
          </div>
          <button type="button" onClick={() => removeToast(toast.id)} className="icon-btn -my-1 -mr-1 w-8 h-8" aria-label="Dismiss notification">
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;
