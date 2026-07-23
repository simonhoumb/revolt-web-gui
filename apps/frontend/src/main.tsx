import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@oicl/openbridge-webcomponents/dist/openbridge.css";
import "./index.css";
import { SessionProvider } from "./context/SessionContext.js";
import { ErrorBoundary } from "./components/layout/ErrorBoundary.js";
import App from "./App.js";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
	<StrictMode>
		<ErrorBoundary>
			<SessionProvider>
				<App />
			</SessionProvider>
		</ErrorBoundary>
	</StrictMode>,
);
