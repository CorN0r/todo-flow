import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="p-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/50 mb-4">
            <span className="text-red-500 text-xl font-bold">!</span>
          </div>
          <h3 className="text-sm font-semibold mb-1">Something went wrong</h3>
          <p className="text-xs text-[#6B7280] mb-3 max-w-md mx-auto">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="text-xs px-4 py-1.5 rounded-lg bg-[#7C72F6] text-white hover:opacity-90"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
