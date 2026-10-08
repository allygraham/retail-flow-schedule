import { useEffect, useState, type RefObject } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import s from './ScrollCue.module.scss';

export function ScrollCue({ target, label }: { target: RefObject<HTMLElement | null>; label: string }) {
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const element = target.current;
    if (!element) return;
    const update = () => {
      const next = { left: element.scrollLeft > 2, right: element.scrollWidth - element.clientWidth - element.scrollLeft > 2 };
      setEdges(current => current.left === next.left && current.right === next.right ? current : next);
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    for (const child of element.children) observer?.observe(child);
    element.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { observer?.disconnect(); element.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [target]);
  if (!edges.left && !edges.right) return null;
  const move = (direction: number) => target.current?.scrollBy({ left: direction * target.current.clientWidth * 0.75, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  return <div className={s.cue} role="group" aria-label={`Scroll ${label}`}>
    <span>More {label}</span>
    <button type="button" disabled={!edges.left} onClick={() => move(-1)} aria-label={`Scroll ${label} left`}><ChevronLeft size={16} aria-hidden /></button>
    <button type="button" disabled={!edges.right} onClick={() => move(1)} aria-label={`Scroll ${label} right`}><ChevronRight size={16} aria-hidden /></button>
  </div>;
}
