import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary.js";

function Bomb(): never {
	throw new Error("boom");
}

describe("ErrorBoundary", () => {
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		// React logs the caught error to console.error on top of componentDidCatch's own logging;
		// expected here, silence it so the test output doesn't read as a real failure.
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
	});

	it("renders children when nothing throws", () => {
		render(
			<ErrorBoundary>
				<div>All good</div>
			</ErrorBoundary>,
		);
		expect(screen.getByText("All good")).toBeInTheDocument();
	});

	it("renders a fallback instead of a blank tree when a child throws during render", () => {
		render(
			<ErrorBoundary>
				<Bomb />
			</ErrorBoundary>,
		);
		expect(screen.getByText("Something went wrong")).toBeInTheDocument();
		expect(screen.getByText("boom")).toBeInTheDocument();
	});

	it("reloads the page when the reload button is clicked", () => {
		const reload = vi.fn();
		Object.defineProperty(window, "location", {
			configurable: true,
			value: { reload },
		});

		render(
			<ErrorBoundary>
				<Bomb />
			</ErrorBoundary>,
		);
		fireEvent.click(screen.getByText("Reload"));

		expect(reload).toHaveBeenCalledTimes(1);
	});
});
