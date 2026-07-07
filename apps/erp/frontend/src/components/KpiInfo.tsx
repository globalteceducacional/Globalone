import { useCallback, useEffect, useId, useRef, useState } from 'react';

/** Ícone (i) com tooltip em position: fixed (acima de conteúdo seguinte; não usa title nativo). */
export function KpiInfo({ text, className = '' }: { text: string; className?: string }) {
  const tipId = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const leaveTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, placeAbove: false });

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current != null) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const measure = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    const estH = 120;
    const spaceBelow = window.innerHeight - r.bottom;
    const placeAbove = spaceBelow < estH && r.top > estH;
    const top = placeAbove ? r.top - margin : r.bottom + margin;
    const left = r.left + r.width / 2;
    setCoords({ top, left, placeAbove });
  }, []);

  const showTip = useCallback(() => {
    clearLeaveTimer();
    measure();
    setOpen(true);
  }, [clearLeaveTimer, measure]);

  const hideTipSoon = useCallback(() => {
    clearLeaveTimer();
    leaveTimerRef.current = window.setTimeout(() => setOpen(false), 200);
  }, [clearLeaveTimer]);

  useEffect(() => {
    if (!open) return;
    measure();
    const onScroll = () => measure();
    const onResize = () => measure();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, measure]);

  useEffect(() => () => clearLeaveTimer(), [clearLeaveTimer]);

  return (
    <>
      <span ref={anchorRef} className="inline-flex shrink-0 align-middle">
        <button
          type="button"
          tabIndex={0}
          aria-describedby={open ? tipId : undefined}
          aria-expanded={open}
          onMouseEnter={showTip}
          onMouseLeave={hideTipSoon}
          onFocus={showTip}
          onBlur={() => {
            clearLeaveTimer();
            setOpen(false);
          }}
          className={`inline-flex items-center justify-center rounded-full p-1 text-current/45 transition-colors hover:text-current/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/35 cursor-help ${className}`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>
      </span>
      {open ? (
        <span
          id={tipId}
          role="tooltip"
          style={{
            position: 'fixed',
            left: coords.left,
            top: coords.top,
            transform: coords.placeAbove ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
            zIndex: 9999,
          }}
          className="pointer-events-none w-max max-w-[min(20rem,calc(100vw-2rem))] rounded-lg bg-slate-950 px-2.5 py-2 text-left text-xs leading-snug text-slate-100 shadow-xl ring-1 ring-white/20"
        >
          {text}
        </span>
      ) : null}
    </>
  );
}
