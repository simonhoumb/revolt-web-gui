import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl";
import { s52Color, type ChartPalette } from "./s52Colors.js";

export type SymbolStyle = "simplified" | "traditional";

// Exported so useLightSectors.ts (client-computed sector-wedge geometry, which can't be expressed
// as a declarative MapLibre style layer over vector tile data the way everything else in this file
// is) can query the same source without a second, driftable copy of this id.
export const VECTOR_SOURCE_ID = "oslo-fjord";

// Day/bright are light-background S-52 palettes, dusk/night are dark-background. Shared by the
// CARTO basemap variant choice below and by the text/halo pairing in the depth-label layers: text
// needs to sit on the opposite pole (dark text on a light palette, light text on a dark one) from
// its own halo to read reliably, and CHGRD (a general "dominant grey" token, not specifically meant
// for label contrast) doesn't do that on its own -- it lands close to CHWHT in every palette this
// app uses, which is why depth labels were nearly unreadable in dusk/night before this split.
function isLightPalette(palette: ChartPalette): boolean {
	return palette === "day" || palette === "bright";
}

// CARTO's raster basemap only ships light/dark variants, not a 4-way palette; bright/day get the
// light basemap, dusk/night get the dark one, same binary split the pre-S-52 style already made,
// just keyed off the fuller palette set now.
function cartoBasemapVariant(palette: ChartPalette): "light_all" | "dark_all" {
	return isLightPalette(palette) ? "light_all" : "dark_all";
}

// Text/halo as opposite ends of the black/white pole for the current palette -- the strongest
// available contrast between a label and its own outline, so it stays legible against whatever
// depth-shade or land fill happens to be behind it, not just one specific background.
function labelColors(palette: ChartPalette): { text: string; halo: string } {
	return isLightPalette(palette)
		? { text: s52Color(palette, "chblk"), halo: s52Color(palette, "chwht") }
		: { text: s52Color(palette, "chwht"), halo: s52Color(palette, "chblk") };
}

// S-57 COLOUR (and CATSPM) are list-valued attributes; MVT has no array type, so Tippecanoe
// stringifies them (e.g. COLOUR=["4"] becomes the literal string '["4"]'). A plain `match`/`==`
// against the numeric code never fires against that string, which is why every buoy/beacon/light in
// the previously-shipped style rendered in its fallback color. Testing for the quoted token as a
// substring works around this without touching the ENC pipeline: the token is always wrapped in
// quotes by JSON.stringify, so e.g. code 1 can't spuriously match inside code 13's ["13"] the way an
// unquoted digit search could.
function hasColourCode(code: number): ExpressionSpecification {
	return ["in", `"${String(code)}"`, ["get", "COLOUR"]];
}

// Same list-valued-attribute workaround as hasColourCode, for SBDARE's NATSUR (seabed nature)
// attribute.
function hasNatsurCode(code: number): ExpressionSpecification {
	return ["in", `"${String(code)}"`, ["get", "NATSUR"]];
}

/** Same red(3)/green(4)/yellow-fallback priority as LIGHT_ICON below, but as a plain function on an
 * already-JSON.parsed COLOUR array rather than a MapLibre expression -- useLightSectors.ts resolves
 * this in JS (it needs the actual hex to paint computed wedge geometry, not just an icon-image
 * string), and shares this instead of re-deriving the same 3/4 color-code mapping a second time. */
export function resolveLightColorToken(colourCodes: unknown): "chred" | "chgrn" | "chylw" {
	if (!Array.isArray(colourCodes)) return "chylw";
	if (colourCodes.includes("3")) return "chred";
	if (colourCodes.includes("4")) return "chgrn";
	return "chylw";
}

// Real S-52's default depth scheme (IHO-recommended defaults): shallow-water contour 2m, deep-water
// contour 30m. Only the safety contour is mariner-configurable in this app (ChartSettingsContext);
// shallow/deep contour aren't exposed as separate settings, so they're fixed at these spec defaults
// rather than left out of the five-band scheme entirely.
const SHALLOW_CONTOUR_M = 2;
const DEEP_CONTOUR_M = 30;

/** Builds the fill-color expression for depth areas: real S-52's five discrete depth bands (DEPIT
 * intertidal, DEPVS very shallow, DEPMS shallow, DEPMD medium-deep, DEPDW deep), not a gradient --
 * a smooth fade reads as "getting deeper" rather than the sharp band boundaries a real ECDIS shows.
 * Each band is an independent literal comparison (not interpolate stops), so this stays correct
 * regardless of how the mariner's safety contour relates to the fixed shallow/deep contours above --
 * e.g. a safety contour set below 2m just means the DEPMS band never matches, not a crash. */
function depareFillExpression(
	palette: ChartPalette,
	safetyContourM: number,
): ExpressionSpecification {
	const depth: ExpressionSpecification = ["coalesce", ["get", "DRVAL1"], 0];
	return [
		"case",
		["<", depth, 0],
		s52Color(palette, "depit"),
		["<", depth, SHALLOW_CONTOUR_M],
		s52Color(palette, "depvs"),
		["<", depth, safetyContourM],
		s52Color(palette, "depms"),
		["<", depth, DEEP_CONTOUR_M],
		s52Color(palette, "depmd"),
		s52Color(palette, "depdw"),
	];
}

// The contour whose own VALDCO exactly matches the configured safety depth is the safety contour
// itself and gets the S-52 DEPSC treatment; every other digitized contour stays a muted line.
// VALDCO is a fixed, chart-surveyed set of depths (whatever this ENC delivery actually digitized),
// not a continuous field, so a safety depth with no exact digitized contour simply has no line to
// highlight here; that's real ENC behavior, not a bug, and not something a nearest-match heuristic
// should paper over by highlighting an unrelated contour.
function isSafetyContour(safetyContourM: number): ExpressionSpecification {
	return ["==", ["coalesce", ["get", "VALDCO"], -1], safetyContourM];
}

function depareLayer(palette: ChartPalette, safetyContourM: number): LayerSpecification {
	return {
		id: "depare",
		type: "fill",
		source: VECTOR_SOURCE_ID,
		"source-layer": "depare",
		paint: { "fill-color": depareFillExpression(palette, safetyContourM) },
	};
}

function depcntLineLayer(palette: ChartPalette, safetyContourM: number): LayerSpecification {
	const highlighted = isSafetyContour(safetyContourM);
	return {
		id: "depcnt-line",
		type: "line",
		source: VECTOR_SOURCE_ID,
		"source-layer": "depcnt",
		minzoom: 9,
		paint: {
			"line-color": [
				"case",
				highlighted,
				s52Color(palette, "depsc"),
				s52Color(palette, "chgrd"),
			],
			"line-width": ["case", highlighted, 1.4, 0.6],
		},
	};
}

function depcntLabelLayer(palette: ChartPalette, safetyContourM: number): LayerSpecification {
	const highlighted = isSafetyContour(safetyContourM);
	const { text, halo } = labelColors(palette);
	return {
		id: "depcnt-label",
		type: "symbol",
		source: VECTOR_SOURCE_ID,
		"source-layer": "depcnt",
		minzoom: 11,
		layout: {
			"text-field": ["to-string", ["get", "VALDCO"]],
			"text-font": ["Noto Sans Regular"],
			"text-size": 10,
		},
		paint: {
			// The safety contour's own label uses a fixed yellow rather than depsc (which is close
			// in tone to the surrounding chart-line greys in every palette, so a depsc-on-depsc-ish
			// halo pairing barely stood out) -- yellow is a distinct hue from the grayscale chart
			// linework in all four palettes, and matches the "attention" color already used for
			// cardinal/special-purpose marks elsewhere in this style.
			"text-color": ["case", highlighted, s52Color(palette, "chylw"), text],
			"text-halo-color": halo,
			"text-halo-width": 1,
		},
	};
}

// Bottom of the stack: background, basemap, depth/land fills, and their own contours/labels. Every
// area-fill layer in this app is opaque, and MapLibre paints later layers over earlier ones, so
// anything meant to be visible *on top of* water (soundings, restricted-area tint, hazard points,
// aids to navigation) must come later in the final layers array than depare -- they were previously
// interleaved before depare in a single list, which silently painted depare's opaque fill directly
// over them wherever a feature happened to fall inside a charted water area.
function waterAndLandLayers(palette: ChartPalette, safetyContourM: number): LayerSpecification[] {
	return [
		{
			id: "background",
			type: "background",
			paint: { "background-color": s52Color(palette, "nodta") },
		},
		{ id: "carto-basemap", type: "raster", source: "carto-basemap" },
		{
			id: "m_covr",
			type: "fill",
			source: VECTOR_SOURCE_ID,
			"source-layer": "m_covr",
			paint: { "fill-opacity": 0 },
		},
		depareLayer(palette, safetyContourM),
		{
			id: "lndare",
			type: "fill",
			source: VECTOR_SOURCE_ID,
			"source-layer": "lndare",
			paint: { "fill-color": s52Color(palette, "landa") },
		},
		{
			id: "coalne",
			type: "line",
			source: VECTOR_SOURCE_ID,
			"source-layer": "coalne",
			paint: { "line-color": s52Color(palette, "cstln"), "line-width": 1.2 },
		},
		{
			id: "slcons",
			type: "line",
			source: VECTOR_SOURCE_ID,
			"source-layer": "slcons",
			minzoom: 10,
			paint: { "line-color": s52Color(palette, "landf"), "line-width": 1 },
		},
		depcntLineLayer(palette, safetyContourM),
		depcntLabelLayer(palette, safetyContourM),
	];
}

// Everything meant to sit visibly on top of the water/land fills above: soundings, seabed nature
// labels, restricted/traffic-scheme areas and lines. Order within this group matters less than
// being after waterAndLandLayers -- none of these opaquely cover a wide area the way depare/lndare
// do (soundg/sbdare are point labels, resare/tsslpt are low-opacity tints, tselne/tssbnd are thin
// lines), so they don't hide each other the way the original ordering bug hid them under depare.
function overlayLayers(palette: ChartPalette, safetyContourM: number): LayerSpecification[] {
	const { text, halo } = labelColors(palette);
	return [
		{
			id: "soundg-label",
			type: "symbol",
			source: VECTOR_SOURCE_ID,
			"source-layer": "soundg",
			minzoom: 13,
			layout: {
				"text-field": ["to-string", ["get", "DEPTH"]],
				"text-font": ["Noto Sans Regular"],
				"text-size": 9,
			},
			paint: {
				// SNDG2 (the shoal-alert variant) for soundings shallower than the safety contour,
				// SNDG1 (the default) otherwise -- real S-52's SOUNDG conditional symbology procedure
				// picks these two tokens the same way, off the same comparison the depare fill and
				// depcnt highlighting already use.
				"text-color": [
					"case",
					["<", ["coalesce", ["get", "DEPTH"], Infinity], safetyContourM],
					s52Color(palette, "sndg2"),
					s52Color(palette, "sndg1"),
				],
				"text-halo-color": halo,
				"text-halo-width": 1,
			},
		},
		{
			id: "sbdare-label",
			type: "symbol",
			source: VECTOR_SOURCE_ID,
			"source-layer": "sbdare",
			minzoom: 13,
			layout: {
				// Standard IHO chart abbreviations (INT 1) for the seabed nature (NATSUR) codes
				// actually present in this ENC delivery; checked in an order that surfaces the more
				// operationally significant material first, not the S-57 list's own element order
				// (a stringified array can't cheaply be "read the first element of" from a MapLibre
				// expression, see hasNatsurCode's comment on the same array-stringification issue).
				// Falls back to an empty label (no text renders) for any NATSUR code not in this set,
				// rather than guessing at an abbreviation.
				"text-field": [
					"case",
					hasNatsurCode(9),
					"R",
					hasNatsurCode(5),
					"St",
					hasNatsurCode(7),
					"P",
					hasNatsurCode(17),
					"Sh",
					hasNatsurCode(4),
					"S",
					hasNatsurCode(2),
					"Cy",
					hasNatsurCode(1),
					"M",
					"",
				],
				"text-font": ["Noto Sans Regular"],
				"text-size": 8,
			},
			paint: { "text-color": text, "text-halo-color": halo, "text-halo-width": 1 },
		},
		{
			// Real S-52 does not fill restricted areas -- confirmed against OpenCPN's own rendering
			// of this same ENC data, which shows only a dotted boundary, no area tint. A "line" layer
			// against a polygon source-layer renders just the polygon's outline, which is exactly
			// that boundary. Uses chmgd (not a dedicated "restricted area" token, which doesn't
			// exist in the real S-52 color table -- CHMGD and TRFCD share identical xyY values
			// there, so the same magenta family already used for traffic-scheme lines below fits).
			id: "resare",
			type: "line",
			source: VECTOR_SOURCE_ID,
			"source-layer": "resare",
			paint: {
				"line-color": s52Color(palette, "chmgd"),
				"line-width": 1.5,
				"line-dasharray": [1, 2],
			},
		},
		{
			// CHMGF (not CHMGD, used for the traffic-scheme line/boundary layers below), a lighter,
			// less saturated magenta -- xyY-distinct from CHMGD, real S-52 uses it specifically for
			// traffic-scheme area fills.
			id: "tsslpt",
			type: "fill",
			source: VECTOR_SOURCE_ID,
			"source-layer": "tsslpt",
			paint: { "fill-color": s52Color(palette, "chmgf"), "fill-opacity": 0.1 },
		},
		{
			id: "tselne",
			type: "line",
			source: VECTOR_SOURCE_ID,
			"source-layer": "tselne",
			minzoom: 9,
			paint: {
				"line-color": s52Color(palette, "chmgd"),
				"line-width": 1,
				"line-dasharray": [2, 2],
			},
		},
		{
			id: "tssbnd",
			type: "line",
			source: VECTOR_SOURCE_ID,
			"source-layer": "tssbnd",
			minzoom: 9,
			// Solid, not dashed, to read as a scheme boundary/limit rather than the separation line
			// itself (tselne).
			paint: { "line-color": s52Color(palette, "chmgd"), "line-width": 1.5 },
		},
	];
}

// Real pictorial S-52 hazard symbols instead of plain circles; still their own layer group (not
// merged into aidsToNavigationLayers) since these are charted dangers, not aids to navigation, and
// come immediately below the AtoN symbols in on-screen priority.
function hazardLayers(): LayerSpecification[] {
	return [
		symbolLayer("uwtroc", "uwtroc", "rock", 10, 0.8),
		symbolLayer("obstrn", "obstrn", "obstruction", 10, 0.8),
		symbolLayer("wrecks", "wrecks", "wreck", 9, 0.8),
	];
}

// CATLAM 1=port(red)/2=starboard(green) determines the simplified S-52 lateral symbol directly;
// the real charted buoy shape (BOYSHP) is deliberately not consulted, matching how the real S-52
// simplified symbol set collapses buoy-shape variety into one canonical lateral symbol per side.
const LATERAL_ICON: ExpressionSpecification = [
	"match",
	["get", "CATLAM"],
	1,
	"buoy-lateral-port",
	2,
	"buoy-lateral-stbd",
	"buoy-default",
];
const BEACON_LATERAL_ICON: ExpressionSpecification = [
	"match",
	["get", "CATLAM"],
	1,
	"beacon-lateral-port",
	2,
	"beacon-lateral-stbd",
	"beacon-default",
];
const CARDINAL_ICON: ExpressionSpecification = [
	"match",
	["get", "CATCAM"],
	1,
	"buoy-cardinal-north",
	2,
	"buoy-cardinal-east",
	3,
	"buoy-cardinal-south",
	4,
	"buoy-cardinal-west",
	"buoy-default",
];

// Lights can carry more than one COLOUR code (sector lights alternating color by bearing); this
// picks one representative icon by priority rather than rendering multiple overlapping symbols.
// Falling back to the caution/attention yellow (rather than a neutral default) if no charted color
// matches keeps an unrecognized light visible as a light, not silently dropped.
const LIGHT_ICON: ExpressionSpecification = [
	"case",
	hasColourCode(3),
	"light-red",
	hasColourCode(4),
	"light-green",
	"light-yellow",
];

function symbolLayer(
	id: string,
	sourceLayer: string,
	iconImage: ExpressionSpecification | string,
	minzoom: number,
	iconSize: number,
	iconOffset?: [number, number],
	iconOpacity?: ExpressionSpecification,
): LayerSpecification {
	return {
		id,
		type: "symbol",
		source: VECTOR_SOURCE_ID,
		"source-layer": sourceLayer,
		minzoom,
		layout: {
			"icon-image": iconImage,
			"icon-size": iconSize,
			"icon-allow-overlap": true,
			...(iconOffset ? { "icon-offset": iconOffset } : {}),
		},
		...(iconOpacity ? { paint: { "icon-opacity": iconOpacity } } : {}),
	};
}

// A lit buoy/beacon is two separate S-57 point features at (nearly) the same coordinate: the
// buoy/beacon's own object (BOYLAT/BCNLAT/etc, colored by CATLAM) and a LIGHTS object (colored by
// its own COLOUR), which only starts appearing once zoom passes the buoy/beacon layers' minzoom.
// Without an offset the light's icon renders dead-center on top of the buoy's, so panning/zooming
// across that minzoom threshold looks like a single symbol changing color rather than two distinct,
// independently-charted symbols appearing together -- offsetting the light upward (as a small flare
// above the main symbol, the same idea real S-52 point symbols use) keeps both visible and legible
// as separate marks instead of occluding each other.
const LIGHT_ICON_OFFSET: [number, number] = [0, -16];

// useLightSectors.ts already draws a colored ring (with a black outline and dashed sector-limit
// lines) around every light that has real SECTR1/SECTR2 data -- showing the point icon on top of
// that ring too is redundant (the ring already conveys "there's a light here" and its color(s) more
// precisely than one representative icon color can) and visually competes with it. Omnidirectional
// lights have no sector concept and no ring, so the point icon stays the only indicator for those.
//
// This hides the icon via icon-opacity, not a layer filter: useLightSectors.ts finds sector-bearing
// features by calling queryRenderedFeatures() against this same "lights" layer, which only sees
// features the layer actually renders -- a filter excluding sectored features would make them
// unqueryable too, silently breaking every ring. Opacity keeps the feature "rendered" (and
// therefore queryable) while making it visually invisible.
const LIGHT_ICON_OPACITY: ExpressionSpecification = ["case", ["has", "SECTR1"], 0, 1];

// OBC's traditional buoy/beacon icons are thin outline linework (paper-chart-style symbols),
// noticeably harder to pick out on a busy chart than the simplified set's solid filled shapes at
// the same pixel size -- sized up to compensate, confirmed necessary by actually looking at both
// side by side, not just assumed.
function aidsToNavigationIconSize(symbolStyle: SymbolStyle): number {
	return symbolStyle === "traditional" ? 1.1 : 0.8;
}

function aidsToNavigationLayers(symbolStyle: SymbolStyle): LayerSpecification[] {
	const size = aidsToNavigationIconSize(symbolStyle);
	return [
		symbolLayer("boylat", "boylat", LATERAL_ICON, 11, size),
		symbolLayer("boyspp", "boyspp", "buoy-special-purpose", 11, size),
		symbolLayer("boycar", "boycar", CARDINAL_ICON, 11, size),
		symbolLayer("boysaw", "boysaw", "buoy-safe-water", 11, size),
		symbolLayer("bcnlat", "bcnlat", BEACON_LATERAL_ICON, 11, size),
		symbolLayer("bcnspp", "bcnspp", "beacon-special-purpose", 11, size),
		symbolLayer("bcnisd", "bcnisd", "beacon-isolated-danger", 11, size),
		symbolLayer("lights", "lights", LIGHT_ICON, 9, 1.0, LIGHT_ICON_OFFSET, LIGHT_ICON_OPACITY),
	];
}

/**
 * Builds the full MapLibre style for the Oslo Fjord chart: S-52 color tables driving every layer's
 * paint, S-52 symbol layers for buoys/beacons/lights (via the sprite sheet generate-chart-sprite.ts
 * produces), and a safety-contour-aware depth presentation. Called fresh whenever palette,
 * symbolStyle, or safetyContourM changes; the caller passes the result to map.setStyle().
 */
export function buildOsloFjordStyle(
	palette: ChartPalette,
	symbolStyle: SymbolStyle,
	safetyContourM: number,
): StyleSpecification {
	const basemapVariant = cartoBasemapVariant(palette);
	const basemapTiles = ["a", "b", "c", "d"].map(
		(subdomain) =>
			`https://${subdomain}.basemaps.cartocdn.com/${basemapVariant}/{z}/{x}/{y}.png`,
	);
	return {
		version: 8,
		name: `Oslo Fjord (${palette})`,
		glyphs: "/tiles/font/{fontstack}/{range}",
		// Unlike glyphs/tiles URLs, MapLibre requires the top-level "sprite" property to be
		// absolute (it errors "Invalid sprite URL ... must be absolute" otherwise), confirmed by
		// actually loading this style in a browser, not just from the style spec docs.
		sprite: `${window.location.origin}/chart-sprites/${symbolStyle}-${palette}`,
		sources: {
			[VECTOR_SOURCE_ID]: { type: "vector", url: "/tiles/oslo-fjord" },
			"carto-basemap": {
				type: "raster",
				tiles: basemapTiles,
				tileSize: 256,
				attribution:
					'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
			},
		},
		layers: [
			...waterAndLandLayers(palette, safetyContourM),
			...overlayLayers(palette, safetyContourM),
			...hazardLayers(),
			...aidsToNavigationLayers(symbolStyle),
		],
	};
}
