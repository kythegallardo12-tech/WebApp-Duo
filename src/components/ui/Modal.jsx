import { useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { animateModalIn, animateModalOut } from '../../utils/animations';

/**
 * Modal - For decisions requiring attention, confirmations, and critical actions
 * When to use Modal: confirmations, destructive actions, focused single-step tasks
 * Applies: Hick's Law (limit choices in modal), Fitts' Law (large action buttons)
 */
const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => {
  const overlayRef = useRef(null);
  const modalRef = useRef(null);

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  useEffect(() => {
    if (isOpen && overlayRef.current && modalRef.current) {
      animateModalIn(overlayRef.current, modalRef.current);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleClose = useCallback(async () => {
    if (overlayRef.current && modalRef.current) {
      const tl = animateModalOut(overlayRef.current, modalRef.current);
      tl.then(() => onClose());
    } else {
      onClose();
    }
  }, [onClose]);

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) {
      handleClose();
    }
  };

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
    }
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="overlay"
      onClick={handleOverlayClick}
      style={{ opacity: 0 }}
    >
      <div
        ref={modalRef}
        className={`glass-card p-0 w-full mx-4 ${sizeClasses[size]}`}
        style={{ opacity: 0 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{title}</h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>
        {/* Content */}
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
