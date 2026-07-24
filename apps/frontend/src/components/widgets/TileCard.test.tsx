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

	it("hides the view-mode button when viewMode/onViewModeChange aren't both provided", () => {
		render(
			<TileCard title="GNSS" widgetId="gnss" editMode={false} onRemove={vi.fn()}>
				<div>content</div>
			</TileCard>,
		);
		expect(screen.queryByLabelText("Switch to detailed view")).not.toBeInTheDocument();
		expect(screen.queryByLabelText("Switch to instrument view")).not.toBeInTheDocument();
	});

	it("shows the view-mode button regardless of edit mode when both props are provided", () => {
		render(
			<TileCard
				title="GNSS"
				widgetId="gnss"
				editMode={false}
				onRemove={vi.fn()}
				viewMode="instrument"
				onViewModeChange={vi.fn()}
			>
				<div>content</div>
			</TileCard>,
		);
		expect(screen.getByLabelText("Switch to detailed view")).toBeInTheDocument();
	});

	it("calls onViewModeChange with the opposite mode when the view-mode button is clicked", () => {
		const onViewModeChange = vi.fn();
		const { rerender } = render(
			<TileCard
				title="GNSS"
				widgetId="gnss"
				editMode={false}
				onRemove={vi.fn()}
				viewMode="instrument"
				onViewModeChange={onViewModeChange}
			>
				<div>content</div>
			</TileCard>,
		);
		screen.getByLabelText("Switch to detailed view").click();
		expect(onViewModeChange).toHaveBeenCalledExactlyOnceWith("detailed");
		onViewModeChange.mockClear();

		rerender(
			<TileCard
				title="GNSS"
				widgetId="gnss"
				editMode={false}
				onRemove={vi.fn()}
				viewMode="detailed"
				onViewModeChange={onViewModeChange}
			>
				<div>content</div>
			</TileCard>,
		);
		screen.getByLabelText("Switch to instrument view").click();
		expect(onViewModeChange).toHaveBeenCalledExactlyOnceWith("instrument");
	});
});
