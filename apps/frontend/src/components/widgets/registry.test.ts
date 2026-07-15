import { describe, it, expect } from "vitest";
import { ALL_WIDGET_IDS, WIDGET_REGISTRY } from "./registry.js";

describe("WIDGET_REGISTRY", () => {
	it("has an entry for every id in ALL_WIDGET_IDS, and no extras", () => {
		const registryIds = Object.keys(WIDGET_REGISTRY).sort();
		const allIds = [...ALL_WIDGET_IDS].sort();
		expect(registryIds).toEqual(allIds);
	});

	it("each entry's own id matches the key it's registered under", () => {
		for (const [key, def] of Object.entries(WIDGET_REGISTRY)) {
			expect(def.id).toBe(key);
		}
	});

	it("each entry has a non-empty label, a component, an icon, and positive default dimensions", () => {
		for (const def of Object.values(WIDGET_REGISTRY)) {
			expect(def.label.length).toBeGreaterThan(0);
			expect(def.component).toBeDefined();
			expect(def.icon).toBeDefined();
			expect(def.defaultW).toBeGreaterThan(0);
			expect(def.defaultH).toBeGreaterThan(0);
		}
	});

	it("min dimensions, where set, never exceed the default dimensions", () => {
		for (const def of Object.values(WIDGET_REGISTRY)) {
			if (def.minW !== undefined) expect(def.minW).toBeLessThanOrEqual(def.defaultW);
			if (def.minH !== undefined) expect(def.minH).toBeLessThanOrEqual(def.defaultH);
		}
	});

	it("ALL_WIDGET_IDS has no duplicate entries", () => {
		expect(new Set(ALL_WIDGET_IDS).size).toBe(ALL_WIDGET_IDS.length);
	});

	it("every entry has a defaultPosition with positive width/height", () => {
		for (const def of Object.values(WIDGET_REGISTRY)) {
			expect(def.defaultPosition.w).toBeGreaterThan(0);
			expect(def.defaultPosition.h).toBeGreaterThan(0);
		}
	});

	it("no two widgets' defaultPosition tiles overlap", () => {
		const defs = Object.values(WIDGET_REGISTRY);
		for (let i = 0; i < defs.length; i++) {
			for (let j = i + 1; j < defs.length; j++) {
				const a = defs[i]?.defaultPosition;
				const b = defs[j]?.defaultPosition;
				if (!a || !b) continue;
				const overlaps =
					a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
				expect(overlaps).toBe(false);
			}
		}
	});

	it("every widget with an instrumentsOnlyPosition has positive width/height, and none overlap", () => {
		const defs = Object.values(WIDGET_REGISTRY).filter((d) => d.instrumentsOnlyPosition);
		for (const def of defs) {
			expect(def.instrumentsOnlyPosition?.w).toBeGreaterThan(0);
			expect(def.instrumentsOnlyPosition?.h).toBeGreaterThan(0);
		}
		for (let i = 0; i < defs.length; i++) {
			for (let j = i + 1; j < defs.length; j++) {
				const a = defs[i]?.instrumentsOnlyPosition;
				const b = defs[j]?.instrumentsOnlyPosition;
				if (!a || !b) continue;
				const overlaps =
					a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
				expect(overlaps).toBe(false);
			}
		}
	});
});
