import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * App-level error boundary — an unexpected render error shows a recoverable
 * message instead of a blank white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  handleReset = () => {
    // Clear persisted session in case corrupted state caused the crash
    try {
      localStorage.removeItem('facevault_session');
    } catch {
      /* ignore */
    }
    this.setState({ error: null });
    window.location.assign('/');
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4 border border-border rounded-xl p-8 bg-card shadow-lg">
          <AlertOctagon className="w-12 h-12 text-destructive mx-auto" />
          <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
          <p className="text-sm text-muted-foreground break-words">
            {this.state.error.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={this.handleReset}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity text-sm font-medium"
          >
            Reset and reload
          </button>
        </div>
      </div>
    );
  }
}
