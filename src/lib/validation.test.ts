import { describe, expect, it } from 'vitest';
import { shiftSchema } from './validation';
const shift = { store_id: '00000000-0000-4000-8000-000000000010', assigned_user_id: null, role_id: null, shift_date: '2026-11-02', start_time: '09:00', end_time: '17:00', break_minutes: 30 };
describe('shift editing validation', () => {
  it('keeps the chosen published state', () => {
    expect(shiftSchema.parse({...shift,is_published:true}).is_published).toBe(true);
    expect(shiftSchema.parse(shift).is_published).toBe(false);
  });
  it('accepts stored times including seconds', () => {
    expect(shiftSchema.safeParse({...shift,start_time:'09:00:00',end_time:'17:00:00'}).success).toBe(true);
  });
  it('rejects reversed, zero-length and malformed times', () => {
    for(const patch of [{end_time:'08:00'},{end_time:'09:00'},{start_time:'25:00'},{end_time:'17:99'}]) expect(shiftSchema.safeParse({...shift,...patch}).success).toBe(false);
  });
  it('rejects fractional, negative, excessive or whole-shift breaks', () => {
    for(const patch of [{break_minutes:0.5},{break_minutes:-1},{break_minutes:241},{end_time:'09:30',break_minutes:30}]) expect(shiftSchema.safeParse({...shift,...patch}).success).toBe(false);
  });
  it('rejects invalid calendar dates', () => {
    for(const shift_date of ['2026-02-30','2026-13-01','2026-2-1']) expect(shiftSchema.safeParse({...shift,shift_date}).success).toBe(false);
  });
});
