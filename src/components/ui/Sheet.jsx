import { useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { animateSheetIn, animateSheetOut } from '../../utils/animations';

/**
 * Sheet - Slides in from right for multi-step forms, details, editing
 * When to use Sheet: editing/creating records, viewing details, multi-field forms
 * Applies: Occam's Razor (only show relevant info), Visual Hierarchy
 */
const Sheet = ({ isOpen, onClose, title, children, width = 'max-w-lg' }) => {
  const overlayRef = useRef(null);
  const sheetRef = useRef(null);

  useEffect(() => {
    if (isOpen && overlayRef.current && sheetRef.current) {
      animateSheetIn(overlayRef.current, sheetRef.current);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleClose = useCallback(async () => {
    if (overlayRef.current && sheetRef.current) {
      const tl = animateSheetOut(overlayRef.current, sheetRef.current);
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
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
      onClick={handleOverlayClick}
      style={{ opacity: 0 }}
    >
      <div
        ref={sheetRef}
        className={`fixed right-0 top-0 h-full ${width} w-full bg-[var(--color-bg-secondary)] border-l border-white/5 shadow-2xl overflow-y-auto`}
        style={{ transform: 'translateX(100%)' }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[var(--color-bg-secondary)]/80 backdrop-blur-md">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{title}</h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            aria-label="Close sheet"
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

export default Sheet;
