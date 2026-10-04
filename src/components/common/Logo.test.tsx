import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Ctx as AuthContext } from '@/features/auth/authContext';
import { Ctx as BrandingContext } from '@/features/branding/brandingContext';
import { DEFAULT_THEME } from '@/features/branding/types';
import { Logo } from './Logo';

afterEach(cleanup);
const auth = {
  loading: false, error: null, session: null, user: null, fullName: null,
  business: { id: 'shop', name: 'The Top Drawer', slug: 'shop', industry: null },
  role: 'owner' as const, hasPermission: () => true, signOut: vi.fn(), refresh: vi.fn(),
};
const branding = {
  theme: DEFAULT_THEME, savedTheme: DEFAULT_THEME, loading: false,
  refresh: vi.fn(), previewTheme: vi.fn(), clearPreviewTheme: vi.fn(),
};
const show = (businessLogo: boolean, logoUrl: string | null = null) => (
  <MemoryRouter><AuthContext.Provider value={auth}>
    <BrandingContext.Provider value={{ ...branding, theme: { ...DEFAULT_THEME, logoUrl } }}>
      <Logo useBusinessLogo={businessLogo} />
    </BrandingContext.Provider>
  </AuthContext.Provider></MemoryRouter>
);

describe('optional workspace branding', () => {
  it('falls back to Lavoro outside the account providers', () => {
    render(<MemoryRouter><Logo useBusinessLogo /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Lavoro' })).toBeInTheDocument();
  });
  it('can switch business branding on and off without changing hook order', () => {
    const view = render(show(false));
    expect(screen.getByText('Lavoro')).toBeInTheDocument();
    view.rerender(show(true));
    expect(screen.getByText('The Top Drawer')).toBeInTheDocument();
    view.rerender(show(false));
    expect(screen.getByText('Lavoro')).toBeInTheDocument();
  });
  it('uses the workspace logo and accessible business name when available', () => {
    render(show(true, '/workspace-logo.svg'));
    expect(screen.getByRole('img', { name: 'The Top Drawer' })).toHaveAttribute('src', '/workspace-logo.svg');
  });
});
