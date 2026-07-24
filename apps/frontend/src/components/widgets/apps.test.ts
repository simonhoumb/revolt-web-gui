import { describe, it, expect } from "vitest";
import { APPS, ALL_APP_IDS } from "./apps.js";
import { ALL_WIDGET_IDS } from "./registry.js";

function overlaps(a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean {
	return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

describe("APPS", () => {
	it("has an entry for every id in ALL_APP_IDS, and no extras", () => {
		const registryIds = Object.keys(APPS).sort();
		const allIds = [...ALL_APP_IDS].sort();
		expect(registryIds).toEqual(allIds);
	});

	it("each entry's own id matches the key it's registered under", () => {
		for (const [key, def] of Object.entries(APPS)) {
			expect(def.id).toBe(key);
		}
	});

	it("exactly one entry is the custom (customizable dashboard) app", () => {
		const customApps = Object.values(APPS).filter((def) => def.kind === "custom");
		expect(customApps).toHaveLength(1);
		expect(customApps[0]?.id).toBe("custom");
	});

	it("every locked app's tiles reference only known widget ids", () => {
		const knownIds = new Set(ALL_WIDGET_IDS);
		for (const def of Object.values(APPS)) {
			if (def.kind !== "locked") continue;
			for (const tile of def.tiles) {
				expect(knownIds.has(tile.i)).toBe(true);
			}
		}
	});

	it("every locked app's tiles have positive width/height", () => {
		for (const def of Object.values(APPS)) {
			if (def.kind !== "locked") continue;
			for (const tile of def.tiles) {
				expect(tile.w).toBeGreaterThan(0);
				expect(tile.h).toBeGreaterThan(0);
			}
		}
	});

	it("no two tiles within one locked app's tiles overlap", () => {
		for (const def of Object.values(APPS)) {
			if (def.kind !== "locked") continue;
			for (let i = 0; i < def.tiles.length; i++) {
				for (let j = i + 1; j < def.tiles.length; j++) {
					const a = def.tiles[i];
					const b = def.tiles[j];
					if (!a || !b) continue;
					expect(overlaps(a, b)).toBe(false);
				}
			}
		}
	});

	it("no widget id repeats within one locked app's tiles", () => {
		for (const def of Object.values(APPS)) {
			if (def.kind !== "locked") continue;
			const ids = def.tiles.map((t) => t.i);
			expect(new Set(ids).size).toBe(ids.length);
		}
	});
});
