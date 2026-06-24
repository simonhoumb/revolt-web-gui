import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import App from "./App.js";
import { SessionProvider } from "./context/SessionContext.js";

describe("App", () => {
	it("renders the dashboard panel and map area", () => {
		render(
			<SessionProvider>
				<App />
			</SessionProvider>,
		);

		expect(screen.getByRole("complementary", { name: "Dashboard" })).toBeInTheDocument();
		expect(screen.getByRole("main", { name: "Map" })).toBeInTheDocument();
	});
});
