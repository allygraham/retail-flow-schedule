import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LeaveYearSettings } from './LeaveYearSettings';
const mocks = vi.hoisted(()=>({ role: 'owner', write: vi.fn(), refresh: vi.fn() }));
vi.mock('@/features/auth/authContext',()=>({useOptionalAuth:()=>undefined,useAuth:()=>({ role:mocks.role,business:{id:'shop'},refresh:mocks.refresh })}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>({update:(value:unknown)=>({eq:()=>({select:()=>mocks.write(value)})})})}}));
afterEach(cleanup);
beforeEach(()=>{ vi.clearAllMocks(); mocks.role='owner'; mocks.write.mockResolvedValue({data:[{id:'shop'}],error:null}); mocks.refresh.mockResolvedValue(undefined); });
it('keeps failed save drafts and permits a retry',async()=>{
  mocks.write.mockRejectedValueOnce(new Error('Offline'));
  render(<LeaveYearSettings/>);
  fireEvent.change(screen.getByLabelText('Leave year type'),{target:{value:'tax'}});
  fireEvent.click(screen.getByRole('button',{name:'Save leave year'}));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Leave year type')).toHaveValue('tax');
  expect(mocks.refresh).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Save leave year'}));
  await waitFor(()=>expect(mocks.refresh).toHaveBeenCalledTimes(1));
  expect(mocks.write).toHaveBeenLastCalledWith({leave_year_mode:'tax',leave_year_start_date:null});
});
it('does not report success for a zero-row update',async()=>{
  mocks.write.mockResolvedValue({data:[],error:null});
  render(<LeaveYearSettings/>); fireEvent.click(screen.getByRole('button',{name:'Save leave year'}));
  await screen.findByRole('alert'); expect(mocks.refresh).not.toHaveBeenCalled();
});
it('does not expose leave year controls to managers',()=>{
  mocks.role='manager'; render(<LeaveYearSettings/>);
  expect(screen.queryByLabelText('Leave year type')).not.toBeInTheDocument();
  expect(mocks.write).not.toHaveBeenCalled();
});
