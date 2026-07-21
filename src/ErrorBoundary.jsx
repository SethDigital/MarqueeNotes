import React from "react";

// A React error boundary: if a child throws during render, we show a compact
// fallback instead of unmounting the whole tree (which leaves a blank screen
// with no way to recover — exactly what happened when a modal blew up).
//
// Wrap anything that should be allowed to fail in isolation. The fallback is a
// no-op div by default; pass renderFallback to give the user a real out (e.g. a
// Close button for a modal). The error is logged once and the boundary recovers
// on the next successful render.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep it visible in the console for debugging; never rethrow.
    console.error("ErrorBoundary caught a render error:", error, info);
  }

  render() {
    if (this.state.error) {
      const Fallback = this.props.renderFallback;
      if (Fallback) return <Fallback error={this.state.error} />;
      return (
        <div className="boundary-fallback" role="alert">
          Something went wrong rendering this part.
        </div>
      );
    }
    return this.props.children;
  }
}
