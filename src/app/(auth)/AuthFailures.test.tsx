import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Login from './Login';
import Signup from './Signup';

const mocks = vi.hoisted(() => ({ login: vi.fn(), signup: vi.fn(), rpc: vi.fn(), refresh: vi.fn(), auth: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { signInWithPassword: mocks.login, signUp: mocks.signup }, rpc: mocks.rpc } }));
vi.mock('@/features/auth/authContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/components/common/Logo', () => ({ Logo: () => <span>Lavoro</span> }));

afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockReturnValue({ user: null, business: null, loading: false, error: null, refresh: mocks.refresh });
  mocks.login.mockResolvedValue({ error: null });
  mocks.signup.mockResolvedValue({ data: { session: {} }, error: null });
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.refresh.mockResolvedValue(undefined);
});

function mount(signup = false) {
  const result = render(<MemoryRouter><Routes><Route path="/" element={signup ? <Signup /> : <Login />} /><Route path="/dashboard" element={<h1>Dashboard</h1>} /></Routes></MemoryRouter>);
  const inputs = result.container.querySelectorAll('input');
  const values = signup ? ['Test Owner', 'Test Business', 'owner@example.com', 'test-password'] : ['owner@example.com', 'test-password'];
  inputs.forEach((input, index) => fireEvent.change(input, { target: { value: values[index] } }));
  return screen.getByRole('button', { name: signup ? 'Create workspace' : 'Sign in' });
}

describe('unexpected authentication failures', () => {
  it('releases login after a rejected request, preserves credentials and allows retry', async () => {
    mocks.login.mockRejectedValueOnce(new Error('Network failed'));
    const button = mount();
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not sign in');
    expect(button).toBeEnabled();
    expect(screen.getByDisplayValue('owner@example.com')).toBeInTheDocument();
    fireEvent.click(button);
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(mocks.login).toHaveBeenCalledTimes(2);
  });

  it('releases signup after a rejected request and allows retry', async () => {
    mocks.signup.mockRejectedValueOnce(new Error('Network failed'));
    const button = mount(true);
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not create your workspace');
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(mocks.signup).toHaveBeenCalledTimes(2);
  });

  it.each(['bootstrap', 'refresh'])('releases signup when %s unexpectedly fails without navigating', async (stage) => {
    if (stage === 'bootstrap') mocks.rpc.mockRejectedValueOnce(new Error('Network failed'));
    else mocks.refresh.mockRejectedValueOnce(new Error('Network failed'));
    const button = mount(true);
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not create your workspace');
    expect(button).toBeEnabled();
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument();
  });

  it('keeps signup disabled until refresh completes and prevents duplicate submissions', async () => {
    let complete!: () => void;
    mocks.refresh.mockImplementation(() => new Promise<void>(resolve => { complete = resolve; }));
    const button = mount(true);
    fireEvent.click(button);
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(button).toBeDisabled();
    fireEvent.submit(button.closest('form')!);
    expect(mocks.signup).toHaveBeenCalledTimes(1);
    complete();
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('still waits for email confirmation without creating a workspace', async () => {
    mocks.signup.mockResolvedValue({ data: { session: null }, error: null });
    fireEvent.click(mount(true));
    expect(await screen.findByRole('status')).toHaveTextContent('confirmation link');
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
