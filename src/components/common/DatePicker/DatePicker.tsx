import { useEffect, useRef, useState, useCallback, useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import { DayPicker, type DateRange, type Matcher } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { format, isAfter, isBefore, isSameDay, parseISO, isValid } from 'date-fns';
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
  const [draftRange, setDraftRange] = useState<DateRangeValue | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rangeValue = isRange ? (draftRange ?? (props as RangeProps).value) : null;

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

  useEffect(() => {
    if (!open && draftRange) setDraftRange(null);
  }, [open, draftRange]);

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
      const r = rangeValue;
      if (r?.from && r?.to) return `${format(r.from, displayFormat)} – ${format(r.to, displayFormat)}`;
      if (r?.from) return `${format(r.from, displayFormat)} – …`;
      return '';
    }
    const v = (props as SingleProps).value;
    return v ? format(v, displayFormat) : '';
  }, [isRange, props, displayFormat, rangeValue]);

  const handleClear = useCallback((e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (isRange) {
      setDraftRange(null);
      (props as RangeProps).onChange({ from: null, to: null });
    }
    else (props as SingleProps).onChange(null);
  }, [isRange, props]);

  const handleTriggerClick = useCallback(() => {
    setOpen((current) => !current);
  }, []);

  const handleSingleSelect = (d: Date | undefined) => {
    (props as SingleProps).onChange(d ?? null);
    if (d) setOpen(false);
  };
  const handleRangeSelect = (r: DateRange | undefined, selectedDay: Date) => {
    const current = draftRange ?? (props as RangeProps).value;

    if (current?.from && !current.to) {
      if (isSameDay(selectedDay, current.from)) {
        const next = { from: current.from, to: current.from };
        setDraftRange(null);
        (props as RangeProps).onChange(next);
        setOpen(false);
        return;
      }

      if (isBefore(selectedDay, current.from)) {
        setDraftRange({ from: selectedDay, to: null });
        return;
      }

      const next = { from: current.from, to: selectedDay };
      setDraftRange(null);
      (props as RangeProps).onChange(next);
      setOpen(false);
      return;
    }

    if (current?.from && current.to) {
      setDraftRange({ from: selectedDay, to: null });
      return;
    }

    const next: DateRangeValue = { from: r?.from ?? selectedDay ?? null, to: r?.to ?? null };
    if (next.from && next.to) {
      setDraftRange(null);
      (props as RangeProps).onChange(next);
      setOpen(false);
      return;
    }

    setDraftRange({ from: next.from, to: next.to });
  };

  const hasValue = isRange
    ? !!(rangeValue?.from || rangeValue?.to)
    : !!(props as SingleProps).value;

  return (
    <div className={`${s.wrap} ${className ?? ''}`} ref={wrapRef}>
      <div className={s.triggerWrap}>
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
          className={`${s.trigger} ${hasValue ? '' : s.placeholder} ${allowClear && hasValue && !disabled ? s.triggerWithClear : ''}`}
          onClick={handleTriggerClick}
        >
          <CalendarIcon size={16} aria-hidden />
          <span>{hasValue ? label : placeholder}</span>
          <CalendarIcon size={14} className={s.icon} aria-hidden />
        </button>
        {allowClear && hasValue && !disabled && (
          <button
            type="button"
            aria-label="Clear date"
            className={s.clear}
            onClick={handleClear}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {open && (
        <div className={s.popover} role="dialog" aria-modal="false">
          {isRange ? (
            <DayPicker
              mode="range"
              selected={{
                from: rangeValue?.from ?? undefined,
                to: rangeValue?.to ?? undefined,
              }}
              onSelect={handleRangeSelect}
              defaultMonth={rangeValue?.from ?? minDate ?? new Date()}
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
