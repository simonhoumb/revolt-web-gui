import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TileCard } from "./TileCard.js";

afterEach(() => {
	cleanup();
});

describe("TileCard", () => {
	it("renders the children", () => {
		render(
			<TileCard title="Battery" widgetId="battery" editMode={false} onRemove={vi.fn()}>
				<div>widget content</div>
			</TileCard>,
		);
		expect(screen.getByText("widget content")).toBeInTheDocument();
	});

	it("hides the remove button when not in edit mode", () => {
		render(
			<TileCard title="Battery" widgetId="battery" editMode={false} onRemove={vi.fn()}>
				<div>content</div>
			</TileCard>,
		);
		expect(screen.queryByLabelText("Remove widget")).not.toBeInTheDocument();
	});

	it("shows the remove button in edit mode", () => {
		render(
			<TileCard title="Battery" widgetId="battery" editMode={true} onRemove={vi.fn()}>
				<div>content</div>
			</TileCard>,
		);
		expect(screen.getByLabelText("Remove widget")).toBeInTheDocument();
	});

	it("calls onRemove with this tile's widgetId when the title container fires action-click in edit mode", () => {
		const onRemove = vi.fn();
		render(
			<TileCard title="Battery" widgetId="battery" editMode={true} onRemove={onRemove}>
				<div>content</div>
			</TileCard>,
		);
		// obc-title-container fires "action-click" on itself when a slotted action element is
		// clicked (see the OBC library source) -- the @lit/react wrapper forwards that native
		// event to the onActionClick prop, the same mechanism ConfirmDialog.test.tsx already
		// exercises for obc-modal-window's cancel-click/done-click.
		const container = document.querySelector("obc-title-container");
		expect(container).not.toBeNull();
		act(() => {
			container?.dispatchEvent(new CustomEvent("action-click", { detail: { action: 1 } }));
		});
		expect(onRemove).toHaveBeenCalledExactlyOnceWith("battery");
	});

	it("does not wire an action-click handler when not in edit mode", () => {
		const onRemove = vi.fn();
		render(
			<TileCard title="Battery" widgetId="battery" editMode={false} onRemove={onRemove}>
				<div>content</div>
			</TileCard>,
		);
		const container = document.querySelector("obc-title-container");
		act(() => {
			container?.dispatchEvent(new CustomEvent("action-click", { detail: { action: 1 } }));
		});
		expect(onRemove).not.toHaveBeenCalled();
	});

	it("marks the tile with data-edit-mode only while editing", () => {
		const { rerender } = render(
			<TileCard title="Battery" widgetId="battery" editMode={false} onRemove={vi.fn()}>
				<div>content</div>
			</TileCard>,
		);
		expect(document.querySelector("[data-edit-mode]")).toBeNull();

		rerender(
			<TileCard title="Battery" widgetId="battery" editMode={true} onRemove={vi.fn()}>
				<div>content</div>
			</TileCard>,
		);
		expect(document.querySelector("[data-edit-mode]")).not.toBeNull();
	});
});
