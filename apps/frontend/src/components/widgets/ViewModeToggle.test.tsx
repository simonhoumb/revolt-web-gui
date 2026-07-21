import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewModeToggle } from "./ViewModeToggle.js";

afterEach(() => {
	cleanup();
});

describe("ViewModeToggle", () => {
	it("reflects the current value on the toggle group", () => {
		render(<ViewModeToggle value="instrument" onChange={vi.fn()} />);
		const group = document.querySelector("obc-toggle-button-group") as HTMLElement & {
			value: string;
		};
		expect(group.value).toBe("instrument");
	});

	it("calls onChange with the selected mode", () => {
		const onChange = vi.fn();
		render(<ViewModeToggle value="detailed" onChange={onChange} />);
		const group = document.querySelector("obc-toggle-button-group");

		act(() => {
			group?.dispatchEvent(
				new CustomEvent("value", {
					detail: { value: "instrument", previousValue: "detailed" },
				}),
			);
		});
		expect(onChange).toHaveBeenCalledWith("instrument");
	});
});
