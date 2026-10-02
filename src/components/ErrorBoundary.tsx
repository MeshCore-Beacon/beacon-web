import { Component, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  // a new value clears a caught error, so one broken tab doesn't block the others
  resetKey?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      // React.lazy caches a rejected import, so remounting can't recover a failed chunk load
      // (e.g. a deploy swapped the hashed assets out from under us) — only a real reload can
      const chunkFailure = /dynamically imported module|Loading chunk|error loading|Importing a module script failed/i.test(this.state.error.message);
      return <ErrorFallback chunkFailure={chunkFailure} onRetry={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

function ErrorFallback({ chunkFailure, onRetry }: { chunkFailure: boolean; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-3 p-8 text-text-dim">
      <p className="text-sm font-mono">{t("errorBoundary.message")}</p>
      <button
        type="button"
        className="text-xs font-mono underline cursor-pointer text-primary"
        onClick={() => (chunkFailure ? window.location.reload() : onRetry())}
      >
        {chunkFailure ? t("errorBoundary.reload") : t("errorBoundary.retry")}
      </button>
    </div>
  );
}
