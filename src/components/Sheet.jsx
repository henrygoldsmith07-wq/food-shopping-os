import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cx } from '../lib/utils.js';

/**
 * Bottom sheet / full-screen page overlay. Dismisses on backdrop tap, Escape,
 * or swipe-down. Owns its own focus management: focus moves in on open and
 * returns to the opener on close, and Tab cycles inside the topmost sheet.
 *
 * Split out of ui.jsx to keep that module inside the 500-line boundary
 * (tests/invariants.test.js); the public surface is unchanged and re-exported
 * from ui.jsx, so importers need no new path.
 */
export default function Sheet({ open, onClose, children, full = false, title }) {
  const [render, setRender] = useState(open);
  const [dragY, setDragY] = useState(0);
  const panel = useRef(null);
  const previousFocus = useRef(null);
  const titleId = useId();
  const touch = useRef({ startY: null, scroller: null }).current;
  useEffect(() => {
    if (open) setRender(true);
    else {
      const t = setTimeout(() => setRender(false), 200);
      return () => clearTimeout(t);
    }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    setDragY(0);
    previousFocus.current = document.activeElement;
    const timer = setTimeout(() => {
      const focusable = panel.current?.querySelector(
        '[autofocus], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      (focusable || panel.current)?.focus();
    }, 0);
    return () => {
      clearTimeout(timer);
      if (previousFocus.current?.isConnected) previousFocus.current.focus();
      else document.getElementById('main')?.focus?.();
    };
  }, [open]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);
  if (!render) return null;
  const onTouchStart = (e) => {
    touch.scroller = e.currentTarget.querySelector('[data-sheet-scroll]');
    touch.startY = e.touches[0].clientY;
  };
  const onTouchMove = (e) => {
    if (touch.startY === null) return;
    const dy = e.touches[0].clientY - touch.startY;
    if (dy > 0 && (!touch.scroller || touch.scroller.scrollTop <= 0)) setDragY(dy);
  };
  const onTouchEnd = () => {
    setDragY((dy) => {
      if (dy > 110) onClose();
      return 0;
    });
    touch.startY = null;
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 transition-opacity duration-200"
        style={{ background: 'rgba(10,10,12,0.45)', opacity: open ? 1 : 0 }}
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-hidden={open ? undefined : true}
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Dialog'}
        tabIndex={-1}
        className={cx('sheet-up relative w-full max-w-lg flex flex-col', full ? 'h-full' : 'max-h-[92%] rounded-t-3xl')}
        style={{
          background: 'var(--bg)',
          transition: dragY ? 'none' : 'transform 200ms',
          transform: open ? `translateY(${dragY}px)` : 'translateY(30px)',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
            return;
          }
          if (event.key !== 'Tab') return;
          const open = [...document.querySelectorAll('[aria-modal="true"]:not([aria-hidden="true"])')];
          if (open.length && open[open.length - 1] !== event.currentTarget) return;
          const focusable = [...event.currentTarget.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
          )].filter((element) => {
            if (element.closest('[aria-hidden="true"]')) return false;
            const style = typeof window !== 'undefined' ? window.getComputedStyle(element) : null;
            return style?.display !== 'none' && style?.visibility !== 'hidden';
          });
          if (!focusable.length) {
            event.preventDefault();
            event.currentTarget.focus();
            return;
          }
          const first = focusable[0], last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          } else if (!event.currentTarget.contains(document.activeElement)) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        {!full && <div className="mx-auto mt-2.5 mb-1 h-1 w-10 rounded-full shrink-0" style={{ background: 'var(--line)' }} />}
        {title && (
          <div className="flex items-center justify-between px-5 pt-3 pb-2 shrink-0">
            <h2 id={titleId} className="text-lg font-extrabold tracking-tight">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="tap press flex h-10 w-10 items-center justify-center rounded-full"
              style={{ background: 'var(--card-2)', color: 'var(--muted)' }}
            >
              <X size={18} strokeWidth={2.4} />
            </button>
          </div>
        )}
        <div
          data-sheet-scroll
          tabIndex={0}
          className="overflow-y-auto no-scrollbar flex-1 overscroll-contain"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
