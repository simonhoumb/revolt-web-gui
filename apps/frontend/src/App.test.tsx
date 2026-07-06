import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import App from "./App.js";
import { SessionProvider } from "./context/SessionContext.js";

describe("App", () => {
	it("renders without crashing and mounts the tile grid", () => {
		render(
			<SessionProvider>
				<App />
			</SessionProvider>,
		);

		// The grid container is the only direct child of the layout content area.
		// It carries the CSS module class but is always present in the DOM.
		expect(document.querySelector("obc-top-bar")).toBeInTheDocument();
	});
});
