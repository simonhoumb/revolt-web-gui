import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { RosCommandMeta, RosCommandResult } from "@revolt/shared-types";
import { RosCommandWidget } from "./RosCommandWidget.js";
import { matchRank } from "./matchRank.js";
import { rosCommandApi } from "../../lib/rosCommandApi.js";

vi.mock("../../lib/rosCommandApi.js", async () => {
	const actual = await vi.importActual<typeof import("../../lib/rosCommandApi.js")>(
		"../../lib/rosCommandApi.js",
	);
	return {
		...actual,
		rosCommandApi: {
			list: vi.fn(),
			execute: vi.fn(),
		},
	};
});

// rosCommandApi's methods are plain vi.fn() mocks with no `this` usage, so unbound-method's
// concern (losing `this` binding when torn off an object) doesn't apply here.
/* eslint-disable @typescript-eslint/unbound-method */
const mockList = rosCommandApi.list as Mock;
const mockExecute = rosCommandApi.execute as Mock;
/* eslint-enable @typescript-eslint/unbound-method */

const COMMANDS: RosCommandMeta[] = [
	{
		command_id: "list_topics",
		label: "List topics",
		description: "List every topic currently active on the ROS2 graph.",
		params: [],
	},
	{
		command_id: "echo_topic",
		label: "Echo topic",
		description: "Show the latest message received on a topic.",
		params: [
			{
				name: "topic",
				label: "Topic",
				kind: "topic_select",
				required: true,
				allowed_values: ["/fix", "/heading"],
			},
		],
	},
	{
		command_id: "get_param",
		label: "Get parameter",
		description: "Read a ROS2 parameter's current value.",
		params: [
			{
				name: "name",
				label: "Parameter name",
				kind: "param_select",
				required: true,
				allowed_values: [
					"/waypoint_switcher_node:default_switch_radius",
					"/los_guidance_node:lookahead_distance",
				],
			},
		],
	},
	{
		command_id: "get_param_names",
		label: "List parameter names",
		description: "List every known parameter name, as <node>:<param> pairs.",
		params: [],
	},
];

async function renderWidget() {
	mockList.mockResolvedValue(COMMANDS);
	render(<RosCommandWidget />);
	await act(async () => {
		await Promise.resolve();
	});
}

function promptField() {
	return document.querySelector("obc-text-input-field") as HTMLElement & { value: string };
}

function focusPrompt() {
	// React's onFocus is implemented via a delegated "focusin" listener (plain "focus" doesn't
	// bubble), so that's the event that needs dispatching here -- same reasoning as dispatching
	// "input" directly on the host for typing, rather than trying to reach the shadow-rendered
	// <input> inside these OBC components.
	act(() => {
		promptField().dispatchEvent(new Event("focusin", { bubbles: true }));
	});
}

function blurPrompt() {
	// The listener lives on the wrapping div (see RosCommandWidget.tsx), reached via bubbling
	// "focusout" from the field -- same reasoning as "focusin" for focus.
	act(() => {
		promptField().dispatchEvent(new Event("focusout", { bubbles: true }));
	});
}

function typePrompt(value: string) {
	focusPrompt();
	const field = promptField();
	act(() => {
		field.value = value;
		field.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

function historyContainer() {
	// CSS module class names are hashed at build time but keep the original name as a substring
	// (e.g. "_history_2e591e") -- no data-testid convention exists elsewhere in this codebase, so
	// this matches how the app's own hashed classes are still reliably selectable in tests.
	return document.querySelector('[class*="history"]');
}

function pressKey(key: string) {
	act(() => {
		promptField().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
	});
}

function clickSuggestion(commandId: string, label: string) {
	const menu = document.querySelector("obc-context-menu-input");
	expect(menu).not.toBeNull();
	act(() => {
		menu?.dispatchEvent(
			new CustomEvent("item-click", {
				detail: { value: commandId, option: { value: commandId, label } },
			}),
		);
	});
}

afterEach(() => {
	cleanup();
});

beforeEach(() => {
	vi.clearAllMocks();
});

describe("RosCommandWidget", () => {
	it("shows matching suggestions as the operator types", async () => {
		await renderWidget();
		typePrompt("echo");
		const menu = document.querySelector("obc-context-menu-input") as HTMLElement & {
			options: { value: string; label: string }[];
		};
		expect(menu).not.toBeNull();
		expect(menu.options).toEqual([{ value: "echo_topic", label: "Echo topic" }]);
	});

	it("shows no suggestions before the prompt is focused", async () => {
		await renderWidget();
		expect(document.querySelector("obc-context-menu-input")).toBeNull();
	});

	it("shows every command on focus, before any text is typed", async () => {
		await renderWidget();
		focusPrompt();
		const menu = document.querySelector("obc-context-menu-input") as HTMLElement & {
			options: { value: string; label: string }[];
		};
		expect(menu).not.toBeNull();
		expect(menu.options.map((o) => o.value)).toEqual(COMMANDS.map((c) => c.command_id));
	});

	it("hides suggestions shortly after the prompt is blurred without a selection", async () => {
		vi.useFakeTimers();
		try {
			await renderWidget();
			focusPrompt();
			expect(document.querySelector("obc-context-menu-input")).not.toBeNull();

			blurPrompt();
			expect(document.querySelector("obc-context-menu-input")).not.toBeNull();

			act(() => {
				vi.advanceTimersByTime(150);
			});
			expect(document.querySelector("obc-context-menu-input")).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it("does not hide suggestions if the prompt regains focus before the blur delay elapses", async () => {
		vi.useFakeTimers();
		try {
			await renderWidget();
			focusPrompt();
			blurPrompt();
			act(() => {
				vi.advanceTimersByTime(50);
			});
			focusPrompt();
			act(() => {
				vi.advanceTimersByTime(150);
			});
			expect(document.querySelector("obc-context-menu-input")).not.toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it("selecting a command with no params shows it ready to run immediately", async () => {
		await renderWidget();
		typePrompt("list");
		clickSuggestion("list_topics", "List topics");

		expect(screen.getByText("List topics")).toBeInTheDocument();
		expect(
			screen.getByText("List every topic currently active on the ROS2 graph."),
		).toBeInTheDocument();
		const runButton = document.querySelector("obc-progress-button") as HTMLElement & {
			disabled: boolean;
		};
		expect(runButton.disabled).toBe(false);
	});

	it("a topic_select param only offers the registry-provided allowed values, not free text", async () => {
		await renderWidget();
		typePrompt("echo");
		clickSuggestion("echo_topic", "Echo topic");

		const dropdown = document.querySelector("obc-dropdown-button") as HTMLElement & {
			options: { value: string; label: string }[];
		};
		expect(dropdown).not.toBeNull();
		expect(dropdown.options.map((o) => o.value)).toEqual(["/fix", "/heading"]);
		expect(document.querySelector('obc-text-input-field[label="Topic"]')).toBeNull();
	});

	it("a required dropdown param is pre-filled with its first allowed value, so Run is enabled immediately", async () => {
		// ObcDropdownButton displays options[0] as selected by default without firing
		// dropdown-change -- Run used to stay disabled until the operator picked a different
		// option first, even though the default was already shown and would have been sent as-is.
		await renderWidget();
		typePrompt("echo");
		clickSuggestion("echo_topic", "Echo topic");

		const runButton = document.querySelector("obc-progress-button") as HTMLElement & {
			disabled: boolean;
		};
		expect(runButton.disabled).toBe(false);

		const dropdown = document.querySelector("obc-dropdown-button") as HTMLElement & {
			value: string | undefined;
		};
		expect(dropdown.value).toBe("/fix");
	});

	it("changing the dropdown away from its default still updates the param sent on Run", async () => {
		mockExecute.mockResolvedValue({
			command_id: "echo_topic",
			ok: true,
			error: null,
			result: {},
			executed_at: "2026-07-15T00:00:00Z",
		} satisfies RosCommandResult);
		await renderWidget();
		typePrompt("echo");
		clickSuggestion("echo_topic", "Echo topic");

		const dropdown = document.querySelector("obc-dropdown-button") as HTMLElement;
		act(() => {
			dropdown.dispatchEvent(
				new CustomEvent("dropdown-change", { detail: { value: "/heading" } }),
			);
		});

		const runButton = document.querySelector("obc-progress-button") as HTMLElement;
		await act(async () => {
			runButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(mockExecute).toHaveBeenCalledExactlyOnceWith("echo_topic", { topic: "/heading" });
	});

	it("Run calls rosCommandApi.execute with the selected command and params, and appends a success entry", async () => {
		const result: RosCommandResult = {
			command_id: "echo_topic",
			ok: true,
			error: null,
			result: { topic: "/fix", msg: { latitude: 1.0 }, received_at_ms: 123 },
			executed_at: "2026-07-15T00:00:00Z",
		};
		mockExecute.mockResolvedValue(result);
		await renderWidget();
		typePrompt("echo");
		clickSuggestion("echo_topic", "Echo topic");

		const dropdown = document.querySelector("obc-dropdown-button") as HTMLElement;
		act(() => {
			dropdown.dispatchEvent(
				new CustomEvent("dropdown-change", { detail: { value: "/fix" } }),
			);
		});

		const runButton = document.querySelector("obc-progress-button") as HTMLElement;
		await act(async () => {
			runButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(mockExecute).toHaveBeenCalledExactlyOnceWith("echo_topic", { topic: "/fix" });
		expect(screen.getByText(/"latitude": 1/)).toBeInTheDocument();
	});

	it("renders a failed execution distinctly, without throwing", async () => {
		mockExecute.mockRejectedValue(new Error("ROS command API request failed: 500"));
		await renderWidget();
		typePrompt("list");
		clickSuggestion("list_topics", "List topics");

		const runButton = document.querySelector("obc-progress-button") as HTMLElement;
		await act(async () => {
			runButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(screen.getByText("ROS command API request failed: 500")).toBeInTheDocument();
	});

	it("selecting a command clears the prompt so the operator can start choosing another one", async () => {
		await renderWidget();
		typePrompt("list");
		clickSuggestion("list_topics", "List topics");
		expect(document.querySelector("obc-text-input-field")).toBeNull();
	});

	it("a param_select param offers the registry-provided parameter names, not free text", async () => {
		await renderWidget();
		typePrompt("get param");
		clickSuggestion("get_param", "Get parameter");

		const dropdown = document.querySelector("obc-dropdown-button") as HTMLElement & {
			options: { value: string; label: string }[];
		};
		expect(dropdown).not.toBeNull();
		expect(dropdown.options.map((o) => o.value)).toEqual([
			"/waypoint_switcher_node:default_switch_radius",
			"/los_guidance_node:lookahead_distance",
		]);
		expect(document.querySelector('obc-text-input-field[label="Parameter name"]')).toBeNull();
	});

	it("keeps the original (registry) order among equally-ranked matches", async () => {
		await renderWidget();
		typePrompt("get_param");
		const menu = document.querySelector("obc-context-menu-input") as HTMLElement & {
			options: { value: string; label: string }[];
		};
		// get_param and get_param_names both start with "get_param" (same rank) -- registry order
		// (get_param before get_param_names) must be preserved, not reshuffled.
		expect(menu.options.map((o) => o.value)).toEqual(["get_param", "get_param_names"]);
	});

	it("arrow keys move the highlighted suggestion and Enter selects it, not always the first", async () => {
		await renderWidget();
		focusPrompt();
		// Full list order: list_topics, echo_topic, get_param, get_param_names.
		pressKey("ArrowDown");
		pressKey("Enter");
		expect(screen.getByText("Echo topic")).toBeInTheDocument();
		expect(document.querySelector("obc-dropdown-button")).not.toBeNull();
	});

	it("ArrowUp wraps around to the last suggestion from the first", async () => {
		await renderWidget();
		focusPrompt();
		pressKey("ArrowUp");
		pressKey("Enter");
		expect(screen.getByText("List parameter names")).toBeInTheDocument();
	});

	it("reflects the arrow-key-highlighted suggestion via selectedValues", async () => {
		await renderWidget();
		focusPrompt();
		pressKey("ArrowDown");
		const menu = document.querySelector("obc-context-menu-input") as HTMLElement & {
			selectedValues: string[];
		};
		expect(menu.selectedValues).toEqual(["echo_topic"]);
	});

	it("scrolls the history pane to the bottom when a command is run", async () => {
		mockExecute.mockResolvedValue({
			command_id: "list_topics",
			ok: true,
			error: null,
			result: {},
			executed_at: "t",
		});
		await renderWidget();
		const history = historyContainer();
		if (!history) throw new Error("history container not found");
		Object.defineProperty(history, "scrollHeight", { value: 500, configurable: true });

		typePrompt("list");
		clickSuggestion("list_topics", "List topics");
		const runButton = document.querySelector("obc-progress-button") as HTMLElement;
		await act(async () => {
			runButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(history.scrollTop).toBe(500);
	});

	it("constrains the suggestion dropdown to the space available below the prompt, with internal scrolling", async () => {
		await renderWidget();
		const content = document.querySelector('[class*="content"]');
		const promptRow = document.querySelector('[class*="promptRow"]');
		if (!content || !promptRow) throw new Error("content/promptRow not found");
		// jsdom doesn't compute real layout (getBoundingClientRect always returns zeros), so the
		// geometry the widget would normally measure is provided directly here.
		vi.spyOn(content, "getBoundingClientRect").mockReturnValue({ bottom: 400 } as DOMRect);
		vi.spyOn(promptRow, "getBoundingClientRect").mockReturnValue({ bottom: 100 } as DOMRect);

		focusPrompt();

		// tsc (the authoritative build) requires this cast -- querySelector's return type here is
		// Element | null, which has no .style -- but typescript-eslint's own type resolution
		// disagrees and calls it unnecessary. Verified empirically both ways; suppressed rather
		// than removed, since removing it breaks `pnpm typecheck`.
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
		const scroll = document.querySelector('[class*="suggestionsScroll"]') as HTMLElement | null;
		if (!scroll) throw new Error("suggestions scroll wrapper not found");
		expect(scroll.style.maxHeight).toBe("292px");
	});

	it("floors the suggestion dropdown's height instead of collapsing it in a nearly-shut tile", async () => {
		await renderWidget();
		const content = document.querySelector('[class*="content"]');
		const promptRow = document.querySelector('[class*="promptRow"]');
		if (!content || !promptRow) throw new Error("content/promptRow not found");
		// The tile is so short the prompt row alone nearly fills it -- available space is
		// negative, which must still floor to a usable minimum, not shrink to 0/negative.
		vi.spyOn(content, "getBoundingClientRect").mockReturnValue({ bottom: 110 } as DOMRect);
		vi.spyOn(promptRow, "getBoundingClientRect").mockReturnValue({ bottom: 100 } as DOMRect);

		focusPrompt();

		// tsc (the authoritative build) requires this cast -- querySelector's return type here is
		// Element | null, which has no .style -- but typescript-eslint's own type resolution
		// disagrees and calls it unnecessary. Verified empirically both ways; suppressed rather
		// than removed, since removing it breaks `pnpm typecheck`.
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
		const scroll = document.querySelector('[class*="suggestionsScroll"]') as HTMLElement | null;
		if (!scroll) throw new Error("suggestions scroll wrapper not found");
		expect(scroll.style.maxHeight).toBe("80px");
	});
});

describe("matchRank", () => {
	function meta(commandId: string, label: string): RosCommandMeta {
		return { command_id: commandId, label, description: "", params: [] };
	}

	it("ranks a command_id prefix match above a match that only appears mid-string", () => {
		const prefixMatch = meta("get_param", "Get parameter");
		const midStringMatch = meta("echo_get_param", "Echo get parameter");
		expect(matchRank(prefixMatch, "get")).toBe(0);
		expect(matchRank(midStringMatch, "get")).toBe(1);
	});

	it("also ranks a label prefix match as 0, even if the command_id doesn't match at all", () => {
		const labelPrefixMatch = meta("list_topics", "Echo topic");
		expect(matchRank(labelPrefixMatch, "echo")).toBe(0);
	});

	it("ranks a pure mid-string match (neither id nor label starts with the needle) as 1", () => {
		const midString = meta("get_param", "Get parameter");
		expect(matchRank(midString, "param")).toBe(1);
	});
});
