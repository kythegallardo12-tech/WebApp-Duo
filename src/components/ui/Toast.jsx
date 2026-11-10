import { useEffect, useRef } from 'react';
import { CheckCircle, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';
import gsap from 'gsap';
import useStore from '../../store/useStore';

/**
 * Toast - Feedback notifications
 * Applies: Feedback principle, Peak-end rule (positive confirmation)
 */
const toastIcons = {
  success: <CheckCircle size={18} className="text-emerald-400" />,
  error: <AlertCircle size={18} className="text-red-400" />,
  warning: <AlertTriangle size={18} className="text-amber-400" />,
  info: <Info size={18} className="text-blue-400" />,
};

const toastBorders = {
  success: 'border-emerald-500/20',
  error: 'border-red-500/20',
  warning: 'border-amber-500/20',
  info: 'border-blue-500/20',
};

const ToastItem = ({ toast, onRemove }) => {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      gsap.fromTo(
        ref.current,
        { opacity: 0, x: 40, scale: 0.95 },
        { opacity: 1, x: 0, scale: 1, duration: 0.35, ease: 'back.out(1.5)' }
      );
    }
  }, []);

  const handleDismiss = () => {
    if (ref.current) {
      gsap.to(ref.current, {
        opacity: 0,
        x: 40,
        scale: 0.95,
        duration: 0.2,
        ease: 'power2.in',
        onComplete: () => onRemove(toast.id),
      });
    }
  };

  return (
    <div
      ref={ref}
      className={`glass-card p-4 mb-2 flex items-start gap-3 border ${
        toastBorders[toast.type] || toastBorders.info
      } min-w-[300px] max-w-[400px]`}
    >
      <span className="mt-0.5">{toastIcons[toast.type] || toastIcons.info}</span>
      <div className="flex-1 min-w-0">
        {toast.title && (
          <p className="text-sm font-medium text-[var(--color-text-primary)]">{toast.title}</p>
        )}
        <p className="text-sm text-[var(--color-text-secondary)]">{toast.message}</p>
      </div>
      <button
        onClick={handleDismiss}
        className="p-1 rounded hover:bg-white/5 text-[var(--color-text-muted)]"
      >
        <X size={14} />
      </button>
    </div>
  );
};

const ToastContainer = () => {
  const toasts = useStore((s) => s.toasts);
  const removeToast = useStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="toast">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
};

export default ToastContainer;
