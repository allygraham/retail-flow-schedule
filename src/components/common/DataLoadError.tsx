import { Button } from './Button';

export function DataLoadError({ message, retry }: { message: string; retry: () => Promise<void> }) {
  return <div role="alert" style={{ padding: 24 }}>
    <p>{message}</p>
    <Button onClick={() => { void retry(); }}>Try again</Button>
  </div>;
}
