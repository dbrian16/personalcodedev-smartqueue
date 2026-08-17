import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
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

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-lg w-full text-center space-y-4">
            <div className="flex justify-center">
              <div className="bg-red-100 p-4 rounded-full">
                <AlertTriangle className="text-red-600" size={40} />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-800">Something went wrong</h1>
            <p className="text-gray-600 text-sm">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <details className="bg-gray-50 p-3 rounded text-left text-xs text-gray-600 overflow-auto max-h-40">
              <summary className="cursor-pointer font-semibold mb-2">Error Details</summary>
              <code className="block whitespace-pre-wrap">
                {this.state.error?.stack || 'No stack trace available'}
              </code>
            </details>
            <button
              onClick={this.handleReset}
              className="w-full py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw size={18} /> Try Again
            </button>
            <a
              href="/"
              className="block text-blue-600 hover:text-blue-700 text-sm underline"
            >
              Return to Home
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
