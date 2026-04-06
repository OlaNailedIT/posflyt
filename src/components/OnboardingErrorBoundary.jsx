import React from "react";

/**
 * Catches render errors on onboarding so the app shell does not blank in strict edge cases.
 */
export default class OnboardingErrorBoundary extends React.Component {
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
      console.error("[OnboardingPage]", error, info);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-semibold">Something went wrong loading onboarding.</p>
          <p className="mt-2">Try refreshing the page or go to the dashboard from the menu.</p>
          <button
            type="button"
            className="mt-3 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white"
            onClick={() => this.setState({ hasError: false })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
