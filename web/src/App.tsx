import { useEffect, useState } from "react";
import { api, ApiError, type AppState } from "./api";

// Actions run() performs. Each success is tracked as "demo-<action>" (demo-load,
// demo-increment, demo-decrement, demo-reset, demo-refresh) and any failure as
// "demo-action-failed". Pendo matches these names exactly; don't rename them.
type Action = "load" | "increment" | "decrement" | "reset" | "refresh";

// Seam for Pendo. Novus installs the Pendo agent, which provides window.pendo
// at runtime; this fires a Track Event for each action. No-op when the agent
// isn't present (local dev), so the app and Playwright mocks both stay simple.
function trackEvent(name: Action | "action-failed", props?: Record<string, unknown>) {
  if (typeof window !== "undefined") {
    try {
      window.pendo?.track?.(`demo-${name}`, props);
    } catch {
      // Tracking must never break the app, or make run() report a successful
      // action as failed.
    }
  }
}

// Properties for an action's success event, from the state on screen when the
// action started (prev) and the server state it returned (next).
function successProps(action: Action, prev: AppState, next: AppState, hadError: boolean) {
  switch (action) {
    case "load":
      return { counter: next.counter, lastAction: next.lastAction };
    case "increment":
    case "decrement":
      return { counter: next.counter, previousCounter: prev.counter };
    case "reset":
      // The new counter is always 0, so describe what was cleared instead.
      return { previousCounter: prev.counter, previousLastAction: prev.lastAction };
    case "refresh":
      return {
        counter: next.counter,
        lastAction: next.lastAction,
        previousCounter: prev.counter,
        stateChanged: next.counter !== prev.counter || next.lastAction !== prev.lastAction,
        recoveredFromError: hadError,
      };
  }
}

// StrictMode runs App's mount effect twice in development, so the initial
// GET /api/state is sent twice. Track the initial load's outcome (demo-load or
// demo-action-failed) only once per page load. The flag is module-level so it
// isn't reset if App remounts.
let initialLoadTracked = false;

function shouldTrack(action: Action) {
  if (action !== "load") return true;
  if (initialLoadTracked) return false;
  initialLoadTracked = true;
  return true;
}

export default function App() {
  const [state, setState] = useState<AppState>({ counter: 0, lastAction: "none" });
  const [error, setError] = useState<string | null>(null);

  const run = async (name: Action, fn: () => Promise<AppState>) => {
    // What was on screen when the action started, for the event properties.
    const prev = state;
    const hadError = error !== null;
    try {
      setError(null);
      const next = await fn();
      setState(next);
      if (shouldTrack(name)) trackEvent(name, successProps(name, prev, next, hadError));
    } catch (e) {
      setError((e as Error).message);
      if (shouldTrack(name)) {
        // httpStatus is set only for non-2xx responses (ApiError), so it's absent
        // for network/CORS failures. errorMessage is truncated to fit Pendo's limits.
        trackEvent("action-failed", {
          action: name,
          errorMessage: (e as Error).message?.slice(0, 100),
          httpStatus: e instanceof ApiError ? e.status : undefined,
        });
      }
    }
  };

  useEffect(() => {
    run("load", api.getState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 480, margin: "4rem auto", textAlign: "center" }}>
      <h1>QAWolf Demo</h1>

      <p data-testid="counter-value" style={{ fontSize: "3rem", margin: "1rem 0" }}>
        {state.counter}
      </p>
      <p data-testid="last-action" style={{ color: "#666" }}>
        Last action: {state.lastAction}
      </p>

      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <button data-testid="btn-increment" onClick={() => run("increment", api.increment)}>
          Increment
        </button>
        <button data-testid="btn-decrement" onClick={() => run("decrement", api.decrement)}>
          Decrement
        </button>
        <button data-testid="btn-reset" onClick={() => run("reset", api.reset)}>
          Reset
        </button>
        <button data-testid="btn-refresh" onClick={() => run("refresh", api.getState)}>
          Refresh
        </button>
      </div>

      {error && (
        <p data-testid="error" style={{ color: "crimson", marginTop: 16 }}>
          {error}
        </p>
      )}
    </main>
  );
}
