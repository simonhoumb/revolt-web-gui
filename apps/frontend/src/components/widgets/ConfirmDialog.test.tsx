import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog.js";

afterEach(() => {
	cleanup();
});

describe("ConfirmDialog", () => {
	it("renders nothing when closed", () => {
		render(
			<ConfirmDialog
				open={false}
				title="Start mission?"
				confirmLabel="Start"
				onConfirm={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);
		expect(screen.queryByText("Start mission?")).not.toBeInTheDocument();
	});

	it("shows title/content and calls onConfirm/onCancel from the respective buttons", () => {
		const onConfirm = vi.fn();
		const onCancel = vi.fn();
		render(
			<ConfirmDialog
				open
				title="Start mission?"
				content="Waypoints will be sent."
				confirmLabel="Start"
				onConfirm={onConfirm}
				onCancel={onCancel}
			/>,
		);

		// Title/done-label are projected into obc-modal-window's slots as plain light-DOM
		// elements we authored, so they're directly queryable (unlike obc-sequence-modal's
		// modalTitle, which only lived in its shadow root).
		expect(document.querySelector('[slot="title"]')?.textContent).toBe("Start mission?");
		expect(document.querySelector('[slot="done-label"]')?.textContent).toBe("Start");

		// obc-modal-window renders its own Cancel/Done obc-button elements inside its shadow
		// root -- not reachable via a light-DOM query -- so simulate a completed click the same
		// way the component itself signals one: by dispatching the custom event it re-fires on
		// its host element after an internal click (cancel-click / done-click).
		const modal = document.querySelector("obc-modal-window");
		expect(modal).not.toBeNull();

		act(() => {
			modal?.dispatchEvent(new CustomEvent("cancel-click"));
		});
		expect(onCancel).toHaveBeenCalledOnce();
		expect(onConfirm).not.toHaveBeenCalled();

		act(() => {
			modal?.dispatchEvent(new CustomEvent("done-click"));
		});
		expect(onConfirm).toHaveBeenCalledOnce();
	});

	it("calls onCancel on Escape without calling onConfirm", () => {
		const onConfirm = vi.fn();
		const onCancel = vi.fn();
		render(
			<ConfirmDialog
				open
				title="Pause mission?"
				confirmLabel="Pause"
				onConfirm={onConfirm}
				onCancel={onCancel}
			/>,
		);

		act(() => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		});
		expect(onCancel).toHaveBeenCalledOnce();
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("renders an alarm-status obc-alert-frame alongside the modal when danger is set (Terminate)", () => {
		render(
			<ConfirmDialog
				open
				title="Terminate mission"
				confirmLabel="Terminate"
				danger
				onConfirm={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);
		// obc-alert-frame's :host is position: absolute by its own design -- it's meant to sit as
		// a sibling overlay framing sized content, not wrap it (nesting the modal inside it made
		// both expand to fill the nearest positioned ancestor instead of just outlining the
		// modal). So it should be a *sibling* of obc-modal-window, not its parent.
		const frame = document.querySelector("obc-alert-frame") as
			| (HTMLElement & { status: string })
			| null;
		expect(frame).not.toBeNull();
		expect(frame?.status).toBe("alarm");
		expect(frame?.querySelector("obc-modal-window")).toBeNull();
		expect(frame?.parentElement?.querySelector("obc-modal-window")).not.toBeNull();
	});

	it("does not wrap the modal in an alert frame when danger is not set (Start/Pause)", () => {
		render(
			<ConfirmDialog
				open
				title="Start mission?"
				confirmLabel="Start"
				onConfirm={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);
		expect(document.querySelector("obc-alert-frame")).toBeNull();
	});
});
