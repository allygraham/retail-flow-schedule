import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Signup from './Signup';

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(), rpc: vi.fn(), refresh: vi.fn(), nav: vi.fn(),
  auth: { user: null as any, business: null as any, loading: false },
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { signUp: mocks.signUp }, rpc: mocks.rpc } }));
vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ ...mocks.auth, refresh: mocks.refresh }) }));
vi.mock('react-router-dom', async () => ({ ...await vi.importActual('react-router-dom'), useNavigate: () => mocks.nav }));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth = { user: null, business: null, loading: false };
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.refresh.mockResolvedValue(undefined);
});
const renderSignup = () => render(<MemoryRouter><Signup /></MemoryRouter>);
const submitNewAccount = () => {
  const inputs = screen.getAllByRole('textbox');
  ['Ally Graham', 'The Top Drawer', 'ally@example.com'].forEach((value, i) => fireEvent.change(inputs[i], { target: { value } }));
  fireEvent.change(document.querySelector('input[type="password"]')!, { target: { value: 'StrongPassword123!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
};

describe('workspace onboarding', () => {
  it('waits for confirmation without attempting unauthenticated workspace creation', async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
    renderSignup(); submitNewAccount();
    await screen.findByRole('heading', { name: 'Check your email' });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.nav).not.toHaveBeenCalled();
    expect(mocks.signUp.mock.calls[0][0].options.data.business_name).toBe('The Top Drawer');
  });

  it('lets an already confirmed account finish setup without signing up again', async () => {
    mocks.auth.user = { id: 'confirmed-user', user_metadata: { business_name: 'The Top Drawer' } };
    renderSignup();
    expect(screen.getByRole('textbox')).toHaveValue('The Top Drawer');
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(mocks.nav).toHaveBeenCalledWith('/dashboard', { replace: true }));
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith('bootstrap_business', { _name: 'The Top Drawer', _slug: 'The Top Drawer' });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it('still creates a workspace when signup returns an authenticated session', async () => {
    mocks.signUp.mockResolvedValue({ data: { session: { user: { id: 'new-user' } } }, error: null });
    renderSignup(); submitNewAccount();
    await waitFor(() => expect(mocks.nav).toHaveBeenCalledWith('/dashboard', { replace: true }));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalled();
  });
});
