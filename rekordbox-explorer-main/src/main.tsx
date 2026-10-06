import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

if (new URLSearchParams(window.location.search).has("embed")) {
  document.documentElement.classList.add("embedded");
}

createRoot(document.getElementById("root")!).render(<App />);
