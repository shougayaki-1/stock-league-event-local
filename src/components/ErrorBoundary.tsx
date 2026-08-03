import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 flex flex-col items-center justify-center gap-4 font-black tracking-widest uppercase p-8 text-center">
          <p>エラーが発生しました</p>
          <button
            onClick={() => window.location.reload()}
            className="normal-case tracking-normal bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-6 rounded-lg"
          >
            再読み込み
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
