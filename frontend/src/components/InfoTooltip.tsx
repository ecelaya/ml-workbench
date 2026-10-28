import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

/** Portal keeps contextual help outside cards with clipped overflow. */
export function InfoTooltip({ title, explanation }: { title: string; explanation: string }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, ready: false });
  const cancelClose = () => clearTimeout(timer.current);
  const show = () => { cancelClose(); setOpen(true); };
  const scheduleClose = () => {
    cancelClose();
    timer.current = setTimeout(() => {
      if (document.activeElement !== trigger.current) setOpen(false);
    }, 120);
  };

  useEffect(() => () => clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!trigger.current || !tooltip.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      const box = tooltip.current.getBoundingClientRect();
      const margin = 8;
      const below = anchor.bottom + margin;
      setPosition({
        left: Math.max(margin, Math.min(anchor.left + anchor.width / 2 - box.width / 2, window.innerWidth - box.width - margin)),
        top: Math.max(margin, Math.min(below + box.height <= window.innerHeight - margin ? below : anchor.top - box.height - margin, window.innerHeight - box.height - margin)),
        ready: true,
      });
    };
    place();
    const observer = new ResizeObserver(place);
    if (tooltip.current) observer.observe(tooltip.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !tooltip.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { cancelClose(); setOpen(false); } };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return <>
    <button ref={trigger} type="button" className="info-tooltip-trigger"
      aria-label={`Información sobre ${title}`} aria-describedby={open ? id : undefined}
      onPointerEnter={event => { if (event.pointerType !== 'touch') show(); }}
      onPointerLeave={scheduleClose} onFocus={show} onBlur={() => { cancelClose(); setOpen(false); }}
      onClick={() => { cancelClose(); setOpen(true); }}>
      <Info size={14} strokeWidth={1.8} aria-hidden="true" />
    </button>
    {open && createPortal(<div ref={tooltip} id={id} role="tooltip" className="info-tooltip"
      style={{ left: position.left, top: position.top, visibility: position.ready ? 'visible' : 'hidden' }}
      onPointerEnter={cancelClose} onPointerLeave={scheduleClose}>
      <strong className="info-tooltip-title">{title}</strong>
      <p>{explanation}</p>
    </div>, document.body)}
  </>;
}
