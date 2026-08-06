import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOsloFjordStyle, resolveLightColorToken, type SymbolStyle } from "./chartStyle.js";
import type { ChartPalette } from "./s52Colors.js";

const PALETTES: ChartPalette[] = ["night", "dusk", "day", "bright"];
const SYMBOL_STYLES: SymbolStyle[] = ["simplified", "traditional"];

// The icon-image names this module can produce; kept as a plain list here rather than walking the
// built style's match/case expressions to extract them, since it's the exact set generate-chart-
// sprite.ts's ICONS list also defines and both are meant to be kept in sync by hand -- this test
// exists to catch that drift, not to duplicate a full expression interpreter.
const EXPECTED_ICON_NAMES = [
	"buoy-lateral-port",
	"buoy-lateral-stbd",
	"buoy-cardinal-north",
	"buoy-cardinal-east",
	"buoy-cardinal-south",
	"buoy-cardinal-west",
	"buoy-special-purpose",
	"buoy-safe-water",
	"buoy-default",
	"beacon-lateral-port",
	"beacon-lateral-stbd",
	"beacon-cardinal-north",
	"beacon-cardinal-east",
	"beacon-cardinal-south",
	"beacon-cardinal-west",
	"beacon-special-purpose",
	"beacon-safe-water",
	"beacon-isolated-danger",
	"beacon-default",
	"light-red",
	"light-green",
	"light-yellow",
	"rock",
	"wreck",
	"obstruction",
];

const SPRITE_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../public/chart-sprites");

function loadSpriteKeys(symbolStyle: SymbolStyle, palette: ChartPalette): string[] {
	const raw = readFileSync(join(SPRITE_DIR, `${symbolStyle}-${palette}.json`), "utf-8");
	return Object.keys(JSON.parse(raw) as Record<string, unknown>);
}

describe("buildOsloFjordStyle", () => {
	it.each(PALETTES)(
		"produces a valid style spec for every symbol style at the %s palette",
		(palette) => {
			for (const symbolStyle of SYMBOL_STYLES) {
				const style = buildOsloFjordStyle(palette, symbolStyle, 3);
				expect(style.version).toBe(8);
				expect(style.sources["oslo-fjord"]).toBeDefined();
				expect(style.sources["carto-basemap"]).toBeDefined();
				expect(style.layers.length).toBeGreaterThan(0);
			}
		},
	);

	it("sets an absolute sprite URL from symbolStyle and palette (MapLibre rejects a relative one)", () => {
		const style = buildOsloFjordStyle("night", "traditional", 3);
		expect(style.sprite).toBe(`${window.location.origin}/chart-sprites/traditional-night`);
	});

	it("picks the light CARTO basemap variant for bright/day, dark for dusk/night", () => {
		const brightSources = buildOsloFjordStyle("bright", "simplified", 3).sources[
			"carto-basemap"
		];
		const daySources = buildOsloFjordStyle("day", "simplified", 3).sources["carto-basemap"];
		const duskSources = buildOsloFjordStyle("dusk", "simplified", 3).sources["carto-basemap"];
		const nightSources = buildOsloFjordStyle("night", "simplified", 3).sources["carto-basemap"];

		function firstTileUrl(source: unknown): string {
			return (source as { tiles: string[] }).tiles[0] ?? "";
		}
		expect(firstTileUrl(brightSources)).toContain("light_all");
		expect(firstTileUrl(daySources)).toContain("light_all");
		expect(firstTileUrl(duskSources)).toContain("dark_all");
		expect(firstTileUrl(nightSources)).toContain("dark_all");
	});

	it("produces a different depare fill-color expression for different safety-contour depths", () => {
		const shallow = buildOsloFjordStyle("day", "simplified", 3);
		const deep = buildOsloFjordStyle("day", "simplified", 20);
		const depareShallow = shallow.layers.find((l) => l.id === "depare");
		const depareDeep = deep.layers.find((l) => l.id === "depare");
		expect(depareShallow).toBeDefined();
		expect(depareDeep).toBeDefined();
		expect(JSON.stringify(depareShallow)).not.toBe(JSON.stringify(depareDeep));
	});

	it("bolds only the depcnt line matching the configured safety contour depth", () => {
		const style = buildOsloFjordStyle("day", "simplified", 5);
		const depcntLine = style.layers.find((l) => l.id === "depcnt-line");
		const paint = (depcntLine as { paint: { "line-width": unknown } }).paint;
		expect(JSON.stringify(paint["line-width"])).toContain("5");
	});

	describe.each(SYMBOL_STYLES)("%s symbol set", (symbolStyle) => {
		it.each(PALETTES)(
			"every icon-image name this style can produce exists in the checked-in %s sprite",
			(palette) => {
				const spriteKeys = new Set(loadSpriteKeys(symbolStyle, palette));
				for (const name of EXPECTED_ICON_NAMES) {
					expect(spriteKeys.has(name)).toBe(true);
				}
			},
		);
	});
});

describe("resolveLightColorToken", () => {
	it("resolves red when COLOUR includes the red code", () => {
		expect(resolveLightColorToken(["3"])).toBe("chred");
	});

	it("resolves green when COLOUR includes the green code", () => {
		expect(resolveLightColorToken(["4"])).toBe("chgrn");
	});

	it("prefers red when a feature's COLOUR includes both red and green codes", () => {
		expect(resolveLightColorToken(["4", "3"])).toBe("chred");
	});

	it("falls back to yellow for an unrecognized or missing color code", () => {
		expect(resolveLightColorToken(["1"])).toBe("chylw");
		expect(resolveLightColorToken([])).toBe("chylw");
		expect(resolveLightColorToken(undefined)).toBe("chylw");
		expect(resolveLightColorToken("not-an-array")).toBe("chylw");
	});
});
