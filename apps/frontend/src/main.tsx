import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@oicl/openbridge-webcomponents/dist/openbridge.css";
import "./index.css";
import { SessionProvider } from "./context/SessionContext.js";
import App from "./App.js";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
	<StrictMode>
		<SessionProvider>
			<App />
		</SessionProvider>
	</StrictMode>,
);
