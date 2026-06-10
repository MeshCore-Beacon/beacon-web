import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      // React.lazy caches a rejected import, so remounting can't recover a failed chunk load
      // (e.g. a deploy swapped the hashed assets out from under us) — only a real reload can
      const chunkFailure = /dynamically imported module|Loading chunk|error loading/i.test(this.state.error.message);
      return (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 p-8 text-text-dim">
          <p className="text-sm font-mono">Something went wrong rendering this view.</p>
          <button
            type="button"
            className="text-xs font-mono underline cursor-pointer text-primary"
            onClick={() => (chunkFailure ? window.location.reload() : this.setState({ error: null }))}
          >
            {chunkFailure ? "reload" : "try again"}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
