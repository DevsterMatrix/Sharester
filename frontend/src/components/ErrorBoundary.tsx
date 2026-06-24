import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-gray-900 border border-red-900/50 rounded-2xl p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-500/20 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-red-400" />
            </div>
            <h2 className="text-white font-semibold text-lg mb-2">Something went wrong</h2>
            <p className="text-gray-500 text-sm mb-1">{this.state.error.message}</p>
            <p className="text-gray-700 text-xs font-mono mb-6 text-left bg-gray-800 rounded-lg p-3 overflow-auto max-h-32">
              {this.state.error.stack?.slice(0, 300)}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 mx-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
