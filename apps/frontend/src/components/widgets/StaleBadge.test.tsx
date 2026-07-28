import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StaleBadge } from "./StaleBadge.js";

afterEach(() => {
	cleanup();
});

describe("StaleBadge", () => {
	it("renders the label text", () => {
		render(<StaleBadge />);
		expect(screen.getByText("Stale")).toBeInTheDocument();
	});
});
