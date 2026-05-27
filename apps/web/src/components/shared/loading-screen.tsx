interface LoadingScreenProps {
  stage: string;
  progress: number;
  error: string | null;
  onRetry: () => void;
}

export function LoadingScreen({ stage, progress, error, onRetry }: LoadingScreenProps) {
  return (
    <div className="flex h-dvh w-full items-center justify-center">
      <div className="w-80 space-y-4 text-center">
        {error ? (
          <>
            <div className="text-destructive text-lg font-medium">Failed to initialize</div>
            <p className="text-sm text-muted-foreground">{error}</p>
            <button
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
              onClick={onRetry}
            >
              Retry
            </button>
          </>
        ) : (
          <>
            <div className="text-foreground text-lg font-medium">{stage}</div>
            {progress > 0 && progress < 100 ? (
              <>
                <div className="w-full bg-border rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-primary h-full rounded-full transition-[width] duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="text-sm text-muted-foreground">{progress}%</div>
              </>
            ) : (
              <div className="text-muted-foreground animate-pulse">Loading…</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
