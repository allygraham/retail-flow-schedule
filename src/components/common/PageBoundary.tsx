import { Component, Suspense, type ReactNode } from 'react';
import s from '@/features/auth/ProtectedRoute.module.scss';

class PageLoadError extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className={s.denied} role="alert">
          <p>This page couldn’t load. Reload to try again.</p>
          <button type="button" onClick={() => window.location.reload()}>Reload page</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function PageBoundary({ children }: { children: ReactNode }) {
  return (
    <PageLoadError>
      <Suspense fallback={
        <div className={s.loader} role="status" aria-live="polite">
          <div className={s.spinner} aria-hidden="true" />
          <div className={s.label}>Loading page…</div>
        </div>
      }>
        {children}
      </Suspense>
    </PageLoadError>
  );
}
