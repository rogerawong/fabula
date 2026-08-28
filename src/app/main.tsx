import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import { initAiSettings } from "@/ai/settings";
import { hydrateSession, startPersistence } from "@/store/persistence";
import { App } from "./App";
// Self-hosted fonts — no Google Fonts requests (privacy, docs/05)
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@/index.css";

// Restore the previous session BEFORE first render (no tabs popping in),
// then start the debounced writer. Version mismatch discards cleanly and
// tells the user.
const hydration = hydrateSession(window.localStorage);
startPersistence(window.localStorage, undefined, () => {
  toast.warning(
    "Browser storage is full — this session can't be auto-saved. " +
      "Close unused tabs (large folder imports take the most space).",
    { duration: 10000 },
  );
});
initAiSettings(window.localStorage);

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root element");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (hydration === "reset") {
  setTimeout(() => {
    toast.warning("Saved session was from an older version and has been reset.");
  }, 0);
}
