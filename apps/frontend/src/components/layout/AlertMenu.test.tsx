import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AlertMenu } from "./AlertMenu.js";
import type { AlertEntry } from "../../hooks/useVesselHealth.js";

afterEach(() => {
	cleanup();
});

function makeAlert(overrides: Partial<AlertEntry> = {}): AlertEntry {
	return {
		id: "ws-disconnected",
		title: "WebSocket disconnected",
		description: "No connection to the backend server.",
		level: "alarm",
		...overrides,
	};
}

// obc-alert-menu-item is a Lit element whose title/description/status are assigned as JS
// properties (not reflected DOM attributes, and its own template renders into a shadow root that
// standard Testing Library queries don't traverse) -- reading the live element's properties
// directly is the reliable way to assert what was actually passed down.
interface AlertMenuItemEl extends Element {
	title: string;
	description: string;
	status: string;
}

function asAlertMenuItems(nodes: NodeListOf<Element>): AlertMenuItemEl[] {
	return Array.from(nodes) as unknown as AlertMenuItemEl[];
}

describe("AlertMenu", () => {
	it("renders nothing in the list when there are no alerts", () => {
		render(<AlertMenu alerts={[]} />);
		expect(document.querySelectorAll("obc-alert-menu-item")).toHaveLength(0);
	});

	it("renders one item per alert with its title and description", () => {
		const alerts = [
			makeAlert({ id: "a", title: "Alarm one", description: "First" }),
			makeAlert({ id: "b", title: "Alarm two", description: "Second", level: "warning" }),
		];
		render(<AlertMenu alerts={alerts} />);

		const items = asAlertMenuItems(document.querySelectorAll("obc-alert-menu-item"));
		expect(items).toHaveLength(2);
		expect(items[0]?.title).toBe("Alarm one");
		expect(items[0]?.description).toBe("First");
		expect(items[1]?.title).toBe("Alarm two");
		expect(items[1]?.description).toBe("Second");
	});

	it("maps each alert level to its own item status", () => {
		const alerts = [
			makeAlert({ id: "a", level: "alarm" }),
			makeAlert({ id: "b", level: "warning" }),
			makeAlert({ id: "c", level: "caution" }),
		];
		render(<AlertMenu alerts={alerts} />);

		const items = asAlertMenuItems(document.querySelectorAll("obc-alert-menu-item"));
		expect(items).toHaveLength(3);
		expect(items[0]?.status).toBe("no-ack-alarm");
		expect(items[1]?.status).toBe("no-ack-warning");
		expect(items[2]?.status).toBe("caution");
	});
});
