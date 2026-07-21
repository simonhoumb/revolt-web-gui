import { cleanup, render, screen } from "@testing-library/react";
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

	it("calls onRemove with this tile's widgetId when the remove button is clicked in edit mode", () => {
		const onRemove = vi.fn();
		render(
			<TileCard title="Battery" widgetId="battery" editMode={true} onRemove={onRemove}>
				<div>content</div>
			</TileCard>,
		);
		screen.getByLabelText("Remove widget").click();
		expect(onRemove).toHaveBeenCalledExactlyOnceWith("battery");
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
