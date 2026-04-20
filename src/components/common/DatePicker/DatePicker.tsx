import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { DayPicker, type DateRange, type Matcher } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import s from './DatePicker.module.scss';

export type DateValue = Date | null;
export type DateRangeValue = { from: Date | null; to: Date | null };

type CommonProps = {
  minDate?: Date;
  maxDate?: Date;
  disabledDates?: Matcher | Matcher[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  ariaLabel?: string;
  /** Format used for the trigger label. Defaults to 'd MMM yyyy'. */
  displayFormat?: string;
  className?: string;
  allowClear?: boolean;
};

type SingleProps = CommonProps & {
  mode?: 'single';
  value: DateValue;
  onChange: (date: DateValue) => void;
};

type RangeProps = CommonProps & {
  mode: 'range';
  value: DateRangeValue;
  onChange: (range: DateRangeValue) => void;
};

export type DatePickerProps = SingleProps | RangeProps;

/** Coerce ISO date string `yyyy-MM-dd` ↔ Date safely. */
export const parseISODate = (v: string | null | undefined): Date | null => {
  if (!v) return null;
  const d = parseISO(v);
  return isValid(d) ? d : null;
};
export const toISODate = (d: Date | null | undefined): string =>
  d && isValid(d) ? format(d, 'yyyy-MM-dd') : '';

export function DatePicker(props: DatePickerProps) {
  const {
    minDate, maxDate, disabledDates, placeholder = 'Select date',
    required, disabled, id, name, ariaLabel,
    displayFormat = 'd MMM yyyy', className, allowClear = true,
  } = props;
  const isRange = props.mode === 'range';

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const disabledMatchers = useMemo<Matcher[]>(() => {
    const m: Matcher[] = [];
    if (minDate) m.push({ before: minDate });
    if (maxDate) m.push({ after: maxDate });
    if (Array.isArray(disabledDates)) m.push(...disabledDates);
    else if (disabledDates) m.push(disabledDates);
    return m;
  }, [minDate, maxDate, disabledDates]);

  const label = useMemo(() => {
    if (isRange) {
      const r = (props as RangeProps).value;
      if (r?.from && r?.to) return `${format(r.from, displayFormat)} – ${format(r.to, displayFormat)}`;
      if (r?.from) return `${format(r.from, displayFormat)} – …`;
      return '';
    }
    const v = (props as SingleProps).value;
    return v ? format(v, displayFormat) : '';
  }, [isRange, props, displayFormat]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRange) (props as RangeProps).onChange({ from: null, to: null });
    else (props as SingleProps).onChange(null);
  }, [isRange, props]);

  const handleSingleSelect = (d: Date | undefined) => {
    (props as SingleProps).onChange(d ?? null);
    if (d) setOpen(false);
  };
  const handleRangeSelect = (r: DateRange | undefined) => {
    const next: DateRangeValue = { from: r?.from ?? null, to: r?.to ?? null };
    (props as RangeProps).onChange(next);
    if (next.from && next.to) setOpen(false);
  };

  const hasValue = isRange
    ? !!((props as RangeProps).value?.from || (props as RangeProps).value?.to)
    : !!(props as SingleProps).value;

  return (
    <div className={`${s.wrap} ${className ?? ''}`} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        name={name}
        disabled={disabled}
        aria-label={ariaLabel ?? placeholder}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-required={required || undefined}
        className={`${s.trigger} ${hasValue ? '' : s.placeholder}`}
        onClick={() => setOpen(o => !o)}
      >
        <CalendarIcon size={16} aria-hidden />
        <span>{hasValue ? label : placeholder}</span>
        {allowClear && hasValue && !disabled ? (
          <span
            role="button"
            aria-label="Clear date"
            tabIndex={-1}
            className={s.clear}
            onClick={handleClear}
          >
            <X size={12} />
          </span>
        ) : (
          <CalendarIcon size={14} className={s.icon} aria-hidden style={{ visibility: 'hidden' }} />
        )}
      </button>

      {open && (
        <div className={s.popover} role="dialog" aria-modal="false">
          {isRange ? (
            <DayPicker
              mode="range"
              selected={{
                from: (props as RangeProps).value?.from ?? undefined,
                to: (props as RangeProps).value?.to ?? undefined,
              }}
              onSelect={handleRangeSelect}
              defaultMonth={(props as RangeProps).value?.from ?? minDate ?? new Date()}
              disabled={disabledMatchers.length ? disabledMatchers : undefined}
              numberOfMonths={1}
              showOutsideDays
              className={s.rdp}
              weekStartsOn={1}
            />
          ) : (
            <DayPicker
              mode="single"
              selected={(props as SingleProps).value ?? undefined}
              onSelect={handleSingleSelect}
              defaultMonth={(props as SingleProps).value ?? minDate ?? new Date()}
              disabled={disabledMatchers.length ? disabledMatchers : undefined}
              showOutsideDays
              className={s.rdp}
              weekStartsOn={1}
            />
          )}
        </div>
      )}
    </div>
  );
}
