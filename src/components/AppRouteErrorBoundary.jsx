import React from "react";

/**
 * Catches render errors in routed content so the shell stays usable and no stack traces appear in the UI.
 */
export default class AppRouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error("[AppRouteErrorBoundary]", error, info);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-stone-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-stone-100">
          <p className="text-lg font-semibold">Something went wrong loading this page.</p>
          <p className="mt-2 text-sm text-stone-700 dark:text-stone-300">
            Try going back to the dashboard or refreshing. If the problem continues, contact support from Help.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white dark:bg-teal-500 dark:text-stone-950"
              onClick={() => this.setState({ hasError: false })}
            >
              Try again
            </button>
            <a
              href="/dashboard"
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium dark:border-stone-600"
            >
              Dashboard
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
