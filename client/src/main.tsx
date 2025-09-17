import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Global error handler to prevent chat-related errors from cluttering console
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason?.message?.includes('chat/conversations') || 
      event.reason?.message?.includes('429') ||
      event.reason?.message?.includes('not a valid HTTP method')) {
    console.warn('Suppressed chat-related error:', event.reason?.message);
    event.preventDefault(); // Prevent the error from being logged
  }
});

createRoot(document.getElementById("root")!).render(<App />);
