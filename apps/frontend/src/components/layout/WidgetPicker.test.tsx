import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { WidgetPicker } from "./WidgetPicker.js";
import { useLayout } from "../../context/useLayout.js";
import { ALL_WIDGET_IDS } from "../widgets/registry.js";

vi.mock("../../context/useLayout.js", () => ({
	useLayout: vi.fn(),
}));

const mockUseLayout = useLayout as Mock;

const addWidget = vi.fn();
const removeWidget = vi.fn();
const saveTemplate = vi.fn();
const loadTemplate = vi.fn();
const deleteTemplate = vi.fn();
const resetLayout = vi.fn();
const toggleEditMode = vi.fn();

function setLayout(overrides: Partial<ReturnType<typeof useLayout>> = {}) {
	mockUseLayout.mockReturnValue({
		config: { tiles: [{ i: "battery", x: 0, y: 0, w: 3, h: 5 }], hiddenWidgets: [] },
		addWidget,
		removeWidget,
		templates: [{ name: "Default", tiles: [], hiddenWidgets: [], savedAt: 0 }],
		saveTemplate,
		loadTemplate,
		deleteTemplate,
		resetLayout,
		editMode: false,
		toggleEditMode,
		...overrides,
	});
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("WidgetPicker", () => {
	it("lists every registered widget", () => {
		setLayout();
		render(<WidgetPicker onClose={vi.fn()} />);
		expect(document.querySelectorAll("obc-app-button")).toHaveLength(ALL_WIDGET_IDS.length);
	});

	it("filters the widget list by the search term", () => {
		setLayout();
		render(<WidgetPicker onClose={vi.fn()} />);
		const menu = document.querySelector("obc-app-menu");
		expect(menu).not.toBeNull();

		act(() => {
			menu?.dispatchEvent(new CustomEvent("search", { detail: "gnss" }));
		});
		expect(document.querySelectorAll("obc-app-button")).toHaveLength(1);
	});

	it("adds a hidden widget and removes a visible one on toggle", () => {
		setLayout();
		render(<WidgetPicker onClose={vi.fn()} />);
		const buttons = document.querySelectorAll("obc-app-button");
		const batteryIdx = ALL_WIDGET_IDS.indexOf("battery");
		const gnssIdx = ALL_WIDGET_IDS.indexOf("gnss");

		act(() => {
			buttons[batteryIdx]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(removeWidget).toHaveBeenCalledWith("battery");

		act(() => {
			buttons[gnssIdx]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(addWidget).toHaveBeenCalledWith("gnss");
	});

	it("toggles edit mode and closes the picker only when turning edit mode off", () => {
		const onClose = vi.fn();
		setLayout({ editMode: false });
		const { rerender } = render(<WidgetPicker onClose={onClose} />);
		expect(screen.getByText("Unlock layout")).toBeInTheDocument();

		act(() => {
			screen.getByText("Unlock layout").click();
		});
		expect(toggleEditMode).toHaveBeenCalledOnce();
		expect(onClose).not.toHaveBeenCalled();

		setLayout({ editMode: true });
		rerender(<WidgetPicker onClose={onClose} />);
		expect(screen.getByText("Lock layout")).toBeInTheDocument();
		act(() => {
			screen.getByText("Lock layout").click();
		});
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("loads a template and closes the picker", () => {
		const onClose = vi.fn();
		setLayout({
			templates: [{ name: "Instruments only", tiles: [], hiddenWidgets: [], savedAt: 0 }],
		});
		render(<WidgetPicker onClose={onClose} />);

		act(() => {
			screen.getByText("Instruments only").click();
		});
		expect(loadTemplate).toHaveBeenCalledWith("Instruments only");
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("only shows a delete button for user-saved templates, not built-ins", () => {
		setLayout({
			templates: [
				{ name: "Default", tiles: [], hiddenWidgets: [], savedAt: 0 },
				{ name: "My layout", tiles: [], hiddenWidgets: [], savedAt: 12345 },
			],
		});
		render(<WidgetPicker onClose={vi.fn()} />);
		expect(screen.queryByLabelText("Delete template Default")).not.toBeInTheDocument();
		expect(screen.getByLabelText("Delete template My layout")).toBeInTheDocument();

		act(() => {
			screen.getByLabelText("Delete template My layout").click();
		});
		expect(deleteTemplate).toHaveBeenCalledWith("My layout");
	});

	it("saves a template with the typed name and clears the input, disabled while empty", () => {
		setLayout();
		render(<WidgetPicker onClose={vi.fn()} />);
		const input = screen.getByPlaceholderText("Template name…");
		const saveButton = screen.getByText("Save");
		expect(saveButton).toBeDisabled();

		fireEvent.change(input, { target: { value: "My layout" } });
		expect(saveButton).not.toBeDisabled();

		act(() => {
			saveButton.click();
		});
		expect(saveTemplate).toHaveBeenCalledWith("My layout");
		expect(input).toHaveValue("");
	});

	it("calls resetLayout from the reset button", () => {
		setLayout();
		render(<WidgetPicker onClose={vi.fn()} />);
		act(() => {
			screen.getByText("Reset to default layout").click();
		});
		expect(resetLayout).toHaveBeenCalledOnce();
	});
});
