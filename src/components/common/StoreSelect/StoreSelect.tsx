import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import s from './StoreSelect.module.scss';

export interface StoreOption { id: string; name: string; }

interface Props {
  value: string; // 'all' or store id
  options: StoreOption[];
  onChange: (value: string) => void;
  allLabel?: string;
}

export function StoreSelect({ value, options, onChange, allLabel = 'All stores' }: Props) {
  const [open, setOpen] = useState(false);
  const lastSoleStore = useRef<string | null>(null);
  const soleStoreId = options.length === 1 ? options[0].id : null;

  useEffect(() => {
    const changed = lastSoleStore.current !== soleStoreId;
    lastSoleStore.current = soleStoreId;
    if (changed && soleStoreId && (value === 'all' || !value)) onChange(soleStoreId);
  }, [soleStoreId, value, onChange]);

  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selectedLabel = value === 'all' ? allLabel : (options.find(o => o.id === value)?.name ?? allLabel);

  const pick = (v: string) => { onChange(v); setOpen(false); };

  return (
    <div className={s.wrap} ref={wrapRef}>
      <button
        type="button"
        className={s.trigger}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={s.label}>{selectedLabel}</span>
        <ChevronDown className={`${s.caret} ${open ? s.caretOpen : ''}`} />
      </button>
      {open && (
        <div className={s.menu} role="listbox">
          <button
            type="button"
            className={`${s.option} ${value === 'all' ? s.optionActive : ''}`}
            onClick={() => pick('all')}
            role="option"
            aria-selected={value === 'all'}
          >
            <span>{allLabel}</span>
            {value === 'all' && <Check className={s.check} />}
          </button>
          {options.length > 0 && <div className={s.divider} />}
          {options.map(o => (
            <button
              key={o.id}
              type="button"
              className={`${s.option} ${value === o.id ? s.optionActive : ''}`}
              onClick={() => pick(o.id)}
              role="option"
              aria-selected={value === o.id}
            >
              <span>{o.name}</span>
              {value === o.id && <Check className={s.check} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
