import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { lockScroll } from '../../lib/scrollLock';

/**
 * Accessible dialog on the native <dialog> element (showModal):
 * - the rest of the page is inert, Escape and the backdrop close it
 * - focus moves to the element marked data-autofocus (or the dialog) and returns to the
 *   control that opened it
 * - page scrolling is locked while open and always released on close or unmount
 *
 * variant "modal" is a centred decision; "sheet" slides in from the edge for forms and details.
 */
const Dialog = ({ isOpen, onClose, title, label, description, children, footer, variant = 'modal', side = 'right', width, closeLabel = 'Close' }) => {
  const ref = useRef(null);
  const returnFocus = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descId = useId();

  const isOpenRef = useRef(isOpen);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
    isOpenRef.current = isOpen;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !isOpen) return undefined;
    returnFocus.current = document.activeElement;
    if (!dialog.open) dialog.showModal();
    const target = dialog.querySelector('[data-autofocus]');
    if (target) target.focus();
    const release = lockScroll();
    return () => {
      release();
      if (dialog.open) dialog.close();
      const back = returnFocus.current;
      returnFocus.current = null;
      if (back && back.isConnected && typeof back.focus === 'function') back.focus({ preventScroll: true });
    };
  }, [isOpen]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    // Escape: keep React in charge of the open state.
    const onCancel = (e) => {
      e.preventDefault();
      onCloseRef.current?.();
    };
    // If the browser closes the dialog itself (e.g. a repeated Escape the close-watcher does not
    // let us cancel), sync React so the scroll lock and focus are released.
    const onNativeClose = () => {
      if (isOpenRef.current) onCloseRef.current?.();
    };
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onNativeClose);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onNativeClose);
    };
  }, []);

  // A press that starts and ends on the backdrop closes; a text selection dragged out does not.
  const downOnBackdrop = useRef(false);
  const onPointerDown = (e) => {
    downOnBackdrop.current = e.target === ref.current;
  };
  const onClick = (e) => {
    if (downOnBackdrop.current && e.target === ref.current) onCloseRef.current?.();
    downOnBackdrop.current = false;
  };

  const cls = variant === 'sheet' ? `dialog dialog-sheet${side === 'left' ? ' dialog-sheet-left' : ''}` : 'dialog dialog-modal';

  return (
    <dialog
      ref={ref}
      className={cls}
      style={width ? { '--dialog-width': width } : undefined}
      aria-labelledby={title ? titleId : undefined}
      aria-label={!title ? label : undefined}
      aria-describedby={description ? descId : undefined}
      onPointerDown={onPointerDown}
      onClick={onClick}
      tabIndex={-1}
    >
      {isOpen && (
        <>
          {title && (
            <div className="dialog-header">
              <div className="min-w-0">
                <h2 id={titleId} className="dialog-title truncate">
                  {title}
                </h2>
                {description && (
                  <p id={descId} className="text-[0.8125rem] text-ink-3 mt-0.5">
                    {description}
                  </p>
                )}
              </div>
              <button type="button" onClick={() => onCloseRef.current?.()} className="icon-btn" aria-label={closeLabel}>
                <X size={18} />
              </button>
            </div>
          )}
          <div className="dialog-body">{children}</div>
          {footer && <div className="dialog-footer">{footer}</div>}
        </>
      )}
    </dialog>
  );
};

export default Dialog;
