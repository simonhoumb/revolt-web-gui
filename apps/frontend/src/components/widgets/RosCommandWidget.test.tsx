import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { RosCommandMeta, RosCommandResult } from "@revolt/shared-types";
import { RosCommandWidget } from "./RosCommandWidget.js";
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
				kind: "text",
				required: true,
				allowed_values: null,
			},
		],
	},
];

async function renderWidget() {
	mockList.mockResolvedValue(COMMANDS);
	render(<RosCommandWidget />);
	await act(async () => {
		await Promise.resolve();
	});
}

function typePrompt(value: string) {
	const field = document.querySelector("obc-text-input-field") as HTMLElement & {
		value: string;
	};
	act(() => {
		field.value = value;
		field.dispatchEvent(new Event("input", { bubbles: true }));
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

	it("shows no suggestions for an empty prompt", async () => {
		await renderWidget();
		expect(document.querySelector("obc-context-menu-input")).toBeNull();
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

	it("disables Run until a required param is filled, then enables it", async () => {
		await renderWidget();
		typePrompt("echo");
		clickSuggestion("echo_topic", "Echo topic");

		const runButton = document.querySelector("obc-progress-button") as HTMLElement & {
			disabled: boolean;
		};
		expect(runButton.disabled).toBe(true);

		const dropdown = document.querySelector("obc-dropdown-button") as HTMLElement;
		act(() => {
			dropdown.dispatchEvent(
				new CustomEvent("dropdown-change", { detail: { value: "/fix" } }),
			);
		});
		expect(runButton.disabled).toBe(false);
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
});
