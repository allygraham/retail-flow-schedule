import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { DayPicker, type DateRange, type Matcher } from 'react-day-picker';
import 'react-day-picker/style.css';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { format, isBefore, isSameDay } from 'date-fns';
import s from './DatePicker.module.scss';
import { useFieldControl } from '../fieldContext';

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

export function DatePicker(props: DatePickerProps) {
  const {
    minDate, maxDate, disabledDates, placeholder = 'Select date',
    required, disabled, id, name, ariaLabel,
    displayFormat = 'd MMM yyyy', className, allowClear = true,
  } = props;
  const field = useFieldControl(id);
  const isRange = props.mode === 'range';

  const [open, setOpen] = useState(false);
  const [hoveredDay, setHoveredDay] = useState<Date | null>(null);
  const [draftRange, setDraftRange] = useState<DateRangeValue | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8, width: 320 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rangeValue = isRange ? (draftRange ?? (props as RangeProps).value) : null;

  // Handle Escape in capture so it closes the calendar before its parent form.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = triggerRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = Math.min(320, window.innerWidth - 16);
      const height = Math.min(popoverRef.current?.offsetHeight ?? 0, window.innerHeight - 16);
      const below = anchor.bottom + 6;
      const top = below + height <= window.innerHeight - 8 ? below
        : anchor.top - height - 6 >= 8 ? anchor.top - height - 6
        : Math.max(8, window.innerHeight - height - 8);
      setPosition({ width, left: Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8)), top });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    if (popoverRef.current) observer?.observe(popoverRef.current);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      observer?.disconnect();
    };
  }, [open]);

  useEffect(() => {
    if (!open) { setDraftRange(null); setHoveredDay(null); }
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
    setHoveredDay(null);
    if (isRange) {
      setDraftRange(null);
      (props as RangeProps).onChange({ from: null, to: null });
    }
    else (props as SingleProps).onChange(null);
  }, [isRange, props]);

  const handleSingleSelect = (d: Date | undefined) => {
    (props as SingleProps).onChange(d ?? null);
    if (d) setOpen(false);
  };
  const handleRangeSelect = (_range: DateRange | undefined, selectedDay: Date) => {
    setHoveredDay(null);
    const current = draftRange ?? (props as RangeProps).value;
    const beginRange = () => {
      // The first click is a valid one-day range immediately. Keep the picker
      // open so a second click can extend it; closing must not restore old dates.
      setDraftRange({ from: selectedDay, to: null });
      (props as RangeProps).onChange({ from: selectedDay, to: selectedDay });
    };
    if (current?.from && !current.to) {
      if (isBefore(selectedDay, current.from)) { beginRange(); return; }
      const next = { from: current.from, to: isSameDay(selectedDay, current.from) ? current.from : selectedDay };
      setDraftRange(null);
      (props as RangeProps).onChange(next);
      setOpen(false);
      return;
    }
    beginRange();
  };

  const hasValue = isRange
    ? !!(rangeValue?.from || rangeValue?.to)
    : !!(props as SingleProps).value;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen} modal={false}>
    <div className={`${s.wrap} ${className ?? ''}`}>
      <div className={s.triggerWrap}>
        <Dialog.Trigger asChild><button
          ref={triggerRef}
          type="button"
          id={field.id}
          name={name}
          disabled={disabled}
          aria-label={ariaLabel ?? (field['aria-labelledby'] ? undefined : placeholder)}
          aria-labelledby={ariaLabel ? undefined : field['aria-labelledby']}
          aria-describedby={field['aria-describedby']}
          aria-invalid={field['aria-invalid']}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-required={required || undefined}
          className={`${s.trigger} ${hasValue ? '' : s.placeholder} ${allowClear && hasValue && !disabled ? s.triggerWithClear : ''}`}
        >
          <CalendarIcon size={16} aria-hidden />
          <span>{hasValue ? label : placeholder}</span>
          <CalendarIcon size={14} className={s.icon} aria-hidden />
        </button></Dialog.Trigger>
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

      <Dialog.Portal>
        <Dialog.Content asChild aria-describedby={undefined}>
        <div ref={popoverRef} className={s.popover} style={position} role="dialog" aria-label="Choose date" aria-modal="false" onClick={event => event.stopPropagation()} onMouseLeave={() => setHoveredDay(null)}>
          <Dialog.Title className={s.srOnly}>Choose date</Dialog.Title>
          {isRange ? (
            <DayPicker
              mode="range"
              selected={{
                from: rangeValue?.from ?? undefined,
                to: rangeValue?.to ?? undefined,
              }}
              onSelect={handleRangeSelect}
              onDayMouseEnter={(day, modifiers) => setHoveredDay(modifiers.disabled ? null : day)}
              onMonthChange={() => setHoveredDay(null)}
              modifiers={{ range_preview: rangeValue?.from && !rangeValue.to && hoveredDay && !isBefore(hoveredDay, rangeValue.from)
                ? { from: rangeValue.from, to: hoveredDay } : [] }}
              modifiersClassNames={{ range_preview: s.rangePreview }}
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
        </Dialog.Content>
      </Dialog.Portal>
    </div>
    </Dialog.Root>
  );
}
