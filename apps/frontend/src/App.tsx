import { AppShell } from "./components/layout/AppShell.js";
import { BridgeDataProvider } from "./context/BridgeDataContext.js";

export default function App() {
	return (
		<BridgeDataProvider>
			<AppShell />
		</BridgeDataProvider>
	);
}
