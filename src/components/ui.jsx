import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cx, clamp } from '../lib/utils.js';
import { recipeGlyphFor } from './recipe-icons.jsx';

/* ---------- Layout ---------- */

/**
 * `hidden` is how product modes take a section off a screen: the caller asks
 * for it, the section renders nothing, and the data behind it is untouched.
 */
export const Section = ({ title, action, onAction, children, className, hidden }) => (hidden ? null : (
  <section className={cx('px-5', className)}>
    {title && (
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[0.9375rem] font-bold tracking-tight">{title}</h2>
        {action && (
          <button onClick={onAction} className="tap press text-[0.8125rem] font-semibold" style={{ color: 'var(--accent)' }}>
            {action}
          </button>
        )}
      </div>
    )}
    {children}
  </section>
));

export const Card = ({ children, className, onClick, style, label }) => (
  <div
    onClick={onClick}
    style={style}
    // A card you can tap is a button in everything but the tag, so it gets the
    // role, the tab stop and the keyboard activation that go with one.
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    aria-label={onClick ? label : undefined}
    onKeyDown={onClick ? (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      onClick(event);
    } : undefined}
    className={cx('card p-4', onClick && 'press cursor-pointer', className)}
  >
    {children}
  </div>
);

export const Chip = ({ active, children, onClick, tone }) => (
  <button
    onClick={onClick}
    aria-pressed={active}
    className="tap press shrink-0 rounded-full px-3.5 py-2 text-[0.8125rem] font-semibold border transition-colors"
    style={
      active
        ? { background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'var(--accent)' }
        : { background: 'var(--card)', color: tone || 'var(--muted)', borderColor: 'var(--line)' }
    }
  >
    {children}
  </button>
);

/**
 * One action menu for mouse, keyboard-adjacent context click and touch.
 * Horizontal swipes are deliberately ignored below 72px to keep normal
 * scrolling from becoming an action.
 */
export const GestureMenu = ({
  children, label, actions = [], onSwipeLeft, onSwipeRight, draggable = false,
  onDragStart, onDragOver, onDrop,
}) => {
  const [open, setOpen] = useState(false);
  const touch = useRef({ x: 0, y: 0, timer: null });
  const menu = useRef(null);
  const menuId = useId();
  const cancelLongPress = () => {
    clearTimeout(touch.current.timer);
    touch.current.timer = null;
  };
  useEffect(() => cancelLongPress, []);
  useEffect(() => {
    if (open) menu.current?.querySelector('button')?.focus();
  }, [open]);

  const start = (event) => {
    const point = event.touches[0];
    touch.current.x = point.clientX;
    touch.current.y = point.clientY;
    cancelLongPress();
    touch.current.timer = setTimeout(() => setOpen(true), 550);
  };
  const move = (event) => {
    const point = event.touches[0];
    if (Math.abs(point.clientX - touch.current.x) > 10 || Math.abs(point.clientY - touch.current.y) > 10) {
      cancelLongPress();
    }
  };
  const end = (event) => {
    cancelLongPress();
    const point = event.changedTouches[0];
    const dx = point.clientX - touch.current.x;
    const dy = point.clientY - touch.current.y;
    if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (dx < 0) onSwipeLeft?.();
    else onSwipeRight?.();
  };

  return (
    <div className="relative">
      <div
        role="group"
        aria-label={`Actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        tabIndex={0}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onContextMenu={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault();
            setOpen(true);
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      >
        {children}
      </div>
      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={`Actions for ${label}`}
          className="absolute right-2 top-2 z-30 min-w-36 overflow-hidden rounded-xl border p-1"
          style={{ background: 'var(--card)', borderColor: 'var(--line)', boxShadow: 'var(--shadow-lg)' }}
        >
          {actions.map((action) => (
            <button
              role="menuitem"
              key={action.label}
              onClick={() => {
                action.onClick();
                setOpen(false);
              }}
              className="press block w-full rounded-lg px-3 py-2 text-left text-[0.78125rem] font-bold"
              style={{ color: action.tone === 'danger' ? 'var(--danger)' : 'var(--ink)' }}
            >
              {action.label}
            </button>
          ))}
          <button
            role="menuitem"
            onClick={() => setOpen(false)}
            className="press block w-full rounded-lg px-3 py-2 text-left text-[0.75rem] font-semibold"
            style={{ color: 'var(--muted)' }}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};

export const Pill = ({ children, tone = 'muted' }) => {
  const tones = {
    muted: { background: 'var(--card-2)', color: 'var(--muted)' },
    accent: { background: 'var(--accent-soft)', color: 'var(--accent-deep)' },
    good: { background: 'color-mix(in srgb, var(--good) 14%, transparent)', color: 'var(--good-deep)' },
    warn: { background: 'color-mix(in srgb, var(--warn) 14%, transparent)', color: 'var(--warn-deep)' },
    danger: { background: 'color-mix(in srgb, var(--danger) 14%, transparent)', color: 'var(--danger-deep)' },
    faint: { background: 'var(--card-2)', color: 'var(--faint)' },
  };
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-bold" style={tones[tone]}>
      {children}
    </span>
  );
};

/**
 * An empty state that carries its weight.
 *
 * "Nothing here" is a dead end. This says three things instead: what would be
 * here, why the app can't tell you anything without it, and — where there is
 * one — the button that fixes it. An empty state with no way out of it is just
 * a smaller error message.
 *
 * `note` is for the cases where there is genuinely nothing to do yet: it says
 * so rather than offering a button that wouldn't help.
 */
export const Empty = ({ Icon, title, children, action, onAction, note }) => (
  <Card className="text-center py-8">
    {Icon && <Icon size={28} strokeWidth={1.4} className="mx-auto mb-2.5" style={{ color: 'var(--faint)' }} />}
    {title && <p className="font-bold text-[0.90625rem]">{title}</p>}
    <p className="mx-auto max-w-[34ch] text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>{children}</p>
    {action && onAction && (
      <button
        onClick={onAction}
        className="press mt-3.5 rounded-2xl px-5 py-3 text-[0.84375rem] font-extrabold"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        {action}
      </button>
    )}
    {note && <p className="mt-2.5 text-[0.71875rem] font-semibold" style={{ color: 'var(--faint)' }}>{note}</p>}
  </Card>
);

/* ---------- Data viz ---------- */

/** Circular progress ring with centred label. */
export const Ring = ({ value, max, size = 72, stroke = 7, color = 'var(--accent)', label, sub }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = clamp(max ? value / max : 0, 0, 1);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-extrabold" style={{ fontSize: `${size / 4.4 / 16}rem` }}>{label}</span>
        {sub && <span className="text-[0.5625rem] font-semibold mt-0.5" style={{ color: 'var(--faint)' }}>{sub}</span>}
      </div>
    </div>
  );
};

/** Compact sparkline; single series, area under line, dot on last point. */
export const Sparkline = ({ points, width = 120, height = 36, color = 'var(--series-1)' }) => {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const y = (v) => 3 + (height - 6) * (1 - (v - min) / span);
  const path = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const lastX = (points.length - 1) * step;
  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden="true">
      <path d={`${path} L${width},${height} L0,${height} Z`} fill={color} opacity="0.12" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx={lastX} cy={y(points[points.length - 1])} r="3.5" fill={color} stroke="var(--card)" strokeWidth="2" />
    </svg>
  );
};

/** Vertical bar chart with rounded data-ends and direct label on peak+last. */
export const Bars = ({ data, height = 96, color = 'var(--series-1)', highlight, format = (v) => v }) => {
  const max = Math.max(...data.map((d) => d.value)) || 1;
  const peak = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0);
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d, i) => {
        const hl = highlight === undefined ? i === data.length - 1 : i === highlight;
        const labelled = i === peak || i === data.length - 1;
        return (
          <div key={d.label} className="flex-1 flex flex-col items-center justify-end gap-1 h-full min-w-0">
            {labelled && (
              <span className="text-[0.625rem] font-bold leading-none" style={{ color: 'var(--muted)' }}>
                {format(d.value)}
              </span>
            )}
            <div
              className="w-full rounded-t"
              style={{
                height: `${Math.max(6, (d.value / max) * 72)}%`,
                background: hl ? color : 'color-mix(in srgb, ' + color + ' 32%, var(--card-2))',
                transition: 'height 500ms cubic-bezier(0.22,1,0.36,1)',
              }}
            />
            <span className="text-[0.625rem] font-semibold" style={{ color: 'var(--faint)' }}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
};

/** Thin horizontal progress bar. */
export const Meter = ({ value, max, color = 'var(--accent)', height = 6 }) => (
  <div className="w-full rounded-full overflow-hidden" style={{ background: 'var(--line)', height }}>
    <div
      className="h-full rounded-full"
      style={{
        width: `${clamp((value / max) * 100, 0, 100)}%`,
        background: color,
        transition: 'width 500ms cubic-bezier(0.22,1,0.36,1)',
      }}
    />
  </div>
);

/* ---------- Overlays ---------- */

/** Bottom sheet / full-screen page overlay. Dismisses on backdrop tap, Escape, or swipe-down. */
export const Sheet = ({ open, onClose, children, full = false, title }) => {
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
          const focusable = [...panel.current.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
          )].filter((element) => element.offsetParent !== null || element === document.activeElement);
          if (!focusable.length) {
            event.preventDefault();
            panel.current.focus();
            return;
          }
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
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
};

export const Stepper = ({ value, onChange, min = 1, max = 12 }) => (
  <div className="inline-flex items-center gap-3 rounded-full border px-2 py-1" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
    <button className="press h-7 w-7 rounded-full font-bold" style={{ background: 'var(--card-2)' }} onClick={() => onChange(Math.max(min, value - 1))} aria-label="Decrease">−</button>
    <span className="w-5 text-center font-extrabold text-[0.9375rem]">{value}</span>
    <button className="press h-7 w-7 rounded-full font-bold" style={{ background: 'var(--accent-soft)', color: 'var(--accent-deep)' }} onClick={() => onChange(Math.min(max, value + 1))} aria-label="Increase">+</button>
  </div>
);

/**
 * A switch has no text of its own, so the thing it switches has to be passed
 * in — a screen reader announcing "switch, off" tells you nothing about what
 * is off.
 */
export const Toggle = ({ on, onChange, label }) => (
  <button
    onClick={onChange}
    role="switch"
    aria-checked={on}
    aria-label={label}
    className="tap press relative h-7 w-12 rounded-full transition-colors"
    style={{ background: on ? 'var(--accent)' : 'var(--line)' }}
  >
    <span
      className="absolute top-0.5 h-6 w-6 rounded-full shadow transition-transform"
      style={{ background: on ? 'var(--on-accent)' : 'var(--card)', transform: on ? 'translateX(22px)' : 'translateX(2px)', left: 0 }}
    />
  </button>
);

/** Use the same Lucide glyph system as every other product surface. */
export const FoodArt = ({ recipe, className, alt = '' }) => {
  const { family, Icon } = recipeGlyphFor(recipe);

  return (
    <div
      className={cx('relative flex items-center justify-center overflow-hidden', className)}
      style={{ background: 'var(--card-2)', color: 'var(--muted)' }}
      data-recipe-family={family}
    >
      <Icon
        role={alt ? 'img' : undefined}
        aria-hidden={alt ? undefined : 'true'}
        focusable="false"
        strokeWidth={1.8}
        className="h-[42%] w-[42%] max-h-16 max-w-16"
      >
        {alt ? <title>{alt}</title> : null}
      </Icon>
    </div>
  );
};
