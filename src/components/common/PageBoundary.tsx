import { reportError } from '@/features/monitoring/monitoring';
import { InitialPageLoader } from './InitialPageLoader';
import { LoadingSkeleton } from './LoadingSkeleton';
import { Component, Suspense, type ReactNode } from 'react';
import { Button } from './Button';
import s from './PageBoundary.module.scss';

class PageLoadError extends Component<{ children: ReactNode; fullPage: boolean }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) { reportError(error, 'page-render'); }

  render() {
    if (this.state.failed) {
      return (
        <section className={`${s.error} ${this.props.fullPage ? s.fullPage : ''}`} role="alert">
          <div className={s.content}>
            <span className={s.icon} aria-hidden="true">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 8v4m0 4h.01M10.3 3.9 2.1 18.1A2 2 0 0 0 3.8 21h16.4a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0Z" />
              </svg>
            </span>
            <p className={s.eyebrow}>Let’s try that again</p>
            <h1>This page couldn’t load</h1>
            <p className={s.message}>Reload the page to try again. If the problem continues, check your connection and come back in a moment.</p>
            <Button size="lg" onClick={() => window.location.reload()}>Reload page</Button>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}

export function PageBoundary({ children, fullPage = false }: { children: ReactNode; fullPage?: boolean }) {
  return (
    <PageLoadError fullPage={fullPage}>
      <Suspense fallback={
        fullPage ? <InitialPageLoader /> : <LoadingSkeleton label="Loading page" />
      }>
        {children}
      </Suspense>
    </PageLoadError>
  );
}
