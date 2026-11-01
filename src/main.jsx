import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

const clearLocalData = () => {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith("sv-"))
      .forEach((key) => localStorage.removeItem(key));
  } catch (e) { }
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the stack in the console; the fallback stays friendly for players.
    console.error("Sudostrike crashed", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--bg)] p-6 text-center text-[var(--text)]">
        <div className="w-full max-w-md rounded-lg border border-[var(--line)] bg-[var(--panel)] p-6 shadow-xl">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            The app hit an unexpected error. Reloading usually fixes it.
          </p>
          <p className="mt-3 break-words rounded-md bg-[var(--soft)] p-2 text-left text-xs text-[var(--muted)]">
            {String(this.state.error?.message || this.state.error)}
          </p>
          <div className="mt-5 grid gap-2">
            <button className="btn-primary w-full" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button
              className="btn-secondary w-full"
              onClick={() => {
                clearLocalData();
                window.location.reload();
              }}
            >
              Clear local data &amp; reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
