import { Component, type ReactNode } from 'react';
import { Link } from 'react-router';

export function EgwErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col items-center justify-center gap-6 text-center">
      <div className="space-y-2">
        <h2 className="text-lg font-medium text-foreground">Something went wrong</h2>
        <p className="max-w-sm text-sm text-muted-foreground">{error.message}</p>
      </div>
      <div className="flex gap-4">
        <Link
          to="/egw"
          className="rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-accent"
        >
          Back to books
        </Link>
        <button
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export class EgwErrorBoundary extends Component<
  { fallback: (error: Error, reset: () => void) => ReactNode; children: ReactNode },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  reset = () => this.setState({ error: null });

  override render() {
    if (this.state.error) {
      return this.props.fallback(this.state.error, this.reset);
    }
    return this.props.children;
  }
}
