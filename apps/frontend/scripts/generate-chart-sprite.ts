/**
 * Builds the MapLibre sprite sheets MapWidget's chart style uses for buoy/beacon/light symbols.
 *
 * OBC ships these as Lit icon components (SVG markup embedded in each icon-*.js module as a
 * "this.icon = svg`...`" template string), not as a MapLibre sprite sheet, so this script
 * extracts that markup as plain text (no browser/Lit/DOM needed), recolors it per S-52 palette,
 * rasterizes it, and packs the result into sprite.png/sprite.json pairs, plus the 2x variant.
 *
 * One sprite set per (symbol style x palette) combination, rather than one shared sheet with
 * runtime tinting: MapLibre's icon-color paint property only retints SDF sprites, and hand-rolling
 * a correct SDF distance-field encoder (MapLibre's exact radius/buffer convention) without a way to
 * visually verify the result in this environment was judged too risky compared to plain flat-color
 * PNGs, which can be inspected directly. Icon count is small enough (well under a hundred per set)
 * that this costs some disk space, not meaningfully more build complexity.
 *
 * Run via `pnpm generate:sprite` (apps/frontend/package.json). Output is checked into
 * public/chart-sprites/ rather than generated on every build, since its only input is the already-
 * installed OBC package, not external data that changes independently of a dependency bump.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import potpack from "potpack";
import { PNG } from "pngjs";
import { S52_PALETTES, type ChartPalette, type S52ColorTokens } from "../src/lib/s52Colors.js";

const require = createRequire(import.meta.url);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(SCRIPT_DIR, "../public/chart-sprites");

// Resolved from a known module rather than hardcoded to the installed version's pnpm store path,
// so a future @oicl/openbridge-webcomponents version bump doesn't silently break this script.
const ICON_DIR = dirname(
	require.resolve("@oicl/openbridge-webcomponents/dist/icons/icon-lights.js"),
);

type SymbolStyle = "simplified" | "traditional";
type ColorToken = keyof Pick<S52ColorTokens, "chred" | "chgrn" | "chylw" | "chblk" | "chmgd">;

interface IconSpec {
	/** Sprite key referenced by chartStyle.ts's icon-image expressions. */
	key: string;
	color: ColorToken;
	simplified: string;
	traditional: string;
}

// Simplified icons are matched to S-57 attributes directly (CATLAM/CATCAM/CATSPM), following the
// real S-52 simplified symbol set's own convention of collapsing buoy-shape variety (can, conical,
// spherical, pillar, spar...) down to one canonical lateral/cardinal/etc. symbol regardless of the
// charted BOYSHP value.
//
// Traditional equivalents use OBC's topmark-shape-suffixed icons (e.g. icon-buoy-pilar-north),
// matched by real IALA topmark meaning where OBC's asset set has a clean one: north/east/south/west
// = cardinal topmark, danger = isolated-danger topmark (two black spheres), sphere = safe-water
// topmark (one red sphere), x-shape = special-mark topmark (yellow X). OBC's traditional set has no
// bare "no topmark" lateral buoy/beacon icon, which is how real unlit lateral marks are usually
// drawn, so lateral marks fall back to the generic default icon in traditional style; this is a
// known, deliberate scope limit of this OBC package version, not a bug in this script.
const ICONS: IconSpec[] = [
	{
		key: "buoy-lateral-port",
		color: "chred",
		simplified: "icon-simplified-buoy-lateral-can-red",
		traditional: "icon-buoy-default",
	},
	{
		key: "buoy-lateral-stbd",
		color: "chgrn",
		simplified: "icon-simplified-buoy-lateral-conical-green",
		traditional: "icon-buoy-default",
	},
	{
		key: "buoy-cardinal-north",
		color: "chylw",
		simplified: "icon-simplified-buoy-cardinal-north",
		traditional: "icon-buoy-pilar-north",
	},
	{
		key: "buoy-cardinal-east",
		color: "chylw",
		simplified: "icon-simplified-buoy-cardinal-east",
		traditional: "icon-buoy-pilar-east",
	},
	{
		key: "buoy-cardinal-south",
		color: "chylw",
		simplified: "icon-simplified-buoy-cardinal-south",
		traditional: "icon-buoy-pilar-south",
	},
	{
		key: "buoy-cardinal-west",
		color: "chylw",
		simplified: "icon-simplified-buoy-cardinal-west",
		traditional: "icon-buoy-pilar-west",
	},
	{
		key: "buoy-special-purpose",
		color: "chylw",
		simplified: "icon-simplified-buoy-special-purpose",
		traditional: "icon-buoy-pilar-x-shape",
	},
	{
		key: "buoy-safe-water",
		color: "chred",
		simplified: "icon-simplified-buoy-safe-water",
		traditional: "icon-buoy-pilar-sphere",
	},
	{
		key: "buoy-default",
		color: "chblk",
		simplified: "icon-simplified-buoy-default",
		traditional: "icon-buoy-default",
	},
	{
		key: "beacon-lateral-port",
		color: "chred",
		// OBC ships a "major" red lateral beacon but only a "minor" green one, no "major" green
		// variant exists in this package version; kept as-is rather than forced to match, since
		// there's no meaningful major/minor distinction in the ENC attributes driving this anyway.
		simplified: "icon-simplified-beacon-major-lateral-red",
		traditional: "icon-beacon-default",
	},
	{
		key: "beacon-lateral-stbd",
		color: "chgrn",
		simplified: "icon-simplified-beacon-minor-lateral-green",
		traditional: "icon-beacon-default",
	},
	{
		key: "beacon-cardinal-north",
		color: "chylw",
		simplified: "icon-simplified-beacon-cardinal-north",
		traditional: "icon-beacon-general-north",
	},
	{
		key: "beacon-cardinal-east",
		color: "chylw",
		simplified: "icon-simplified-beacon-cardinal-east",
		traditional: "icon-beacon-general-east",
	},
	{
		key: "beacon-cardinal-south",
		color: "chylw",
		simplified: "icon-simplified-beacon-cardinal-south",
		traditional: "icon-beacon-general-south",
	},
	{
		key: "beacon-cardinal-west",
		color: "chylw",
		simplified: "icon-simplified-beacon-cardinal-west",
		traditional: "icon-beacon-general-west",
	},
	{
		key: "beacon-special-purpose",
		color: "chylw",
		simplified: "icon-simplified-beacon-major-special-purpose",
		traditional: "icon-beacon-general-x-shape",
	},
	{
		key: "beacon-safe-water",
		color: "chred",
		simplified: "icon-simplified-beacon-major-safe-water",
		traditional: "icon-beacon-general-sphere",
	},
	{
		// ISDNG (isolated danger) is xyY-identical to CHMGD in the real S-52 color table, not CHBLK.
		key: "beacon-isolated-danger",
		color: "chmgd",
		simplified: "icon-simplified-beacon-isolated-danger",
		traditional: "icon-beacon-general-danger",
	},
	{
		key: "beacon-default",
		color: "chblk",
		simplified: "icon-simplified-beacon-default",
		traditional: "icon-beacon-default",
	},
	// LIGHTS has no simplified/traditional distinction in OBC's set (one generic icon), only a
	// COLOUR-driven recolor, needed for both style sheets so chartStyle.ts doesn't special-case it.
	// icon-lights.js is a generic UI "lightbulb" glyph (meant for interior/deck lighting controls
	// elsewhere in OBC's design system), not a nautical light symbol -- icon-lighthouse.js reads as
	// an actual navigational light on a chart, which a lightbulb doesn't.
	{
		key: "light-red",
		color: "chred",
		simplified: "icon-lighthouse",
		traditional: "icon-lighthouse",
	},
	{
		key: "light-green",
		color: "chgrn",
		simplified: "icon-lighthouse",
		traditional: "icon-lighthouse",
	},
	{
		key: "light-yellow",
		color: "chylw",
		simplified: "icon-lighthouse",
		traditional: "icon-lighthouse",
	},
	// Hazard point symbols (UWTROC/OBSTRN/WRECKS), real pictorial glyphs instead of plain circles.
	// OBC has no simplified/traditional distinction for rock or the generic isolated-danger glyph
	// (one icon each); wrecks does have two variants, used the same way lights' color variants are
	// (both style fields present so chartStyle.ts's icon-image stays a flat string either way).
	{ key: "rock", color: "chred", simplified: "icon-rock", traditional: "icon-rock" },
	{
		key: "wreck",
		color: "chred",
		simplified: "icon-ship-wreck-iec",
		traditional: "icon-ship-wreck-filled",
	},
	{
		key: "obstruction",
		color: "chred",
		simplified: "icon-chart-isolated-dangers",
		traditional: "icon-chart-isolated-dangers",
	},
];

const moduleTextCache = new Map<string, string>();

function readModuleText(moduleName: string): string {
	const cached = moduleTextCache.get(moduleName);
	if (cached) return cached;
	const text = readFileSync(join(ICON_DIR, `${moduleName}.js`), "utf-8");
	moduleTextCache.set(moduleName, text);
	return text;
}

// Every OBC icon module also assigns a themed variant to `this.iconCss` as a literal svg`` template
// string, alongside the flat monochrome `this.icon` (fill="currentColor" everywhere) this script
// used originally. iconCss is the real, intended design: most icons have a genuine two-tone
// structure -- a colored body path (var(--navigation-light-{red,green,yellow}-color)) plus a
// separate outline/center-dot path (var(--element-active-color)), matching the real IHO convention
// of a black outline and position-marking dot on a colored symbol. Using the flat `icon` variant
// instead collapsed both paths into one color, making the outline/dot invisible against the body.
// Extracting iconCss's text directly avoids needing Lit/a DOM to render it, same as `icon` did.
function extractIconSvg(moduleName: string): string {
	const text = readModuleText(moduleName);
	const match = /this\.iconCss = svg`([\s\S]*?)`;/.exec(text);
	if (!match?.[1]) {
		throw new Error(`could not find an svg\`...\` iconCss template in ${moduleName}.js`);
	}
	return mergeDuplicateStyleAttrs(match[1].trim());
}

// A number of OBC icon modules' iconCss markup has two separate style="..." attributes on the same
// element (one for fill, one for stroke) instead of one combined style -- invalid XML/SVG, tolerated
// by browsers (last one wins) but rejected outright by resvg's strict parser ("attribute 'style' ...
// is already defined"). This is a bug in the upstream package's source, not something introduced by
// recoloring here, so it's fixed at extraction time by merging same-element style attributes into one
// before any var() substitution happens.
function mergeDuplicateStyleAttrs(svg: string): string {
	return svg.replace(/<[a-zA-Z][^>]*>/g, (tag) => {
		const styleValues = [...tag.matchAll(/\sstyle="([^"]*)"/g)].map((m) => m[1] ?? "");
		if (styleValues.length <= 1) return tag;
		const merged = styleValues.join("; ");
		let first = true;
		return tag.replace(/\sstyle="[^"]*"/g, () => {
			if (!first) return "";
			first = false;
			return ` style="${merged}"`;
		});
	});
}

// ship-wreck-filled is the one icon in this set whose iconCss uses a different variable pair
// (--element-active-inverted-color/--element-neutral-color) instead of the usual navigation-light-*
// / --element-active-color roles every other icon here uses; called out explicitly rather than
// silently folded into the general classifier below.
const SHIP_WRECK_FILLED_VAR_ROLES: Record<string, "hue" | "neutralPrimary"> = {
	"--element-active-inverted-color": "hue",
	"--element-neutral-color": "neutralPrimary",
};

type CssVarRole = "hue" | "neutralPrimary" | "neutralSecondary";

function classifyCssVar(moduleName: string, varName: string): CssVarRole {
	const special = SHIP_WRECK_FILLED_VAR_ROLES[varName];
	if (moduleName === "icon-ship-wreck-filled" && special) return special;
	if (varName.startsWith("--navigation-light-")) return "hue";
	if (varName === "--element-disabled-color") return "neutralSecondary";
	// --element-active-color, and any other neutral-ish var this icon set turns out to use.
	return "neutralPrimary";
}

/** Recolors an extracted iconCss SVG: each var(--xxx-color) reference is replaced per its role --
 * "hue" (the icon's own assigned S-52 color) always gets hueHex; "neutralPrimary"/"neutralSecondary"
 * (outline/center-dot roles) get chblk/chgrd UNLESS this icon has no hue role at all (e.g. rock,
 * lighthouse, the traditional buoy/beacon set -- confirmed single-role by reading their iconCss),
 * in which case its one role is the whole icon and should be hueHex too, matching how these
 * genuinely single-color glyphs looked before this change. */
function recolorThemed(
	moduleName: string,
	svg: string,
	hueHex: string,
	neutralPrimaryHex: string,
	neutralSecondaryHex: string,
): string {
	const varsPresent = [...svg.matchAll(/var\((--[a-z-]+)\)/g)].map((m) => m[1] ?? "");
	const hasHueRole = varsPresent.some((v) => classifyCssVar(moduleName, v) === "hue");
	return svg.replace(/var\(--[a-z-]+\)/g, (match) => {
		const varName = match.slice(4, -1);
		const role = classifyCssVar(moduleName, varName);
		if (role === "hue") return hueHex;
		if (!hasHueRole) return hueHex;
		return role === "neutralSecondary" ? neutralSecondaryHex : neutralPrimaryHex;
	});
}

interface RasterizedIcon {
	key: string;
	width: number;
	height: number;
	pixels: Buffer;
	x: number;
	y: number;
}

function rasterizeIcon(
	spec: IconSpec,
	symbolStyle: SymbolStyle,
	palette: ChartPalette,
	sizePx: number,
): RasterizedIcon {
	const moduleName = symbolStyle === "simplified" ? spec.simplified : spec.traditional;
	const tokens = S52_PALETTES[palette];
	const svg = recolorThemed(
		moduleName,
		extractIconSvg(moduleName),
		tokens[spec.color],
		tokens.chblk,
		tokens.chgrd,
	);
	const rendered = new Resvg(svg, { fitTo: { mode: "width", value: sizePx } }).render();
	return {
		key: spec.key,
		width: rendered.width,
		height: rendered.height,
		pixels: rendered.pixels,
		x: 0,
		y: 0,
	};
}

interface SpriteAtlasEntry {
	width: number;
	height: number;
	x: number;
	y: number;
	pixelRatio: number;
	sdf: false;
}

function buildAtlas(
	symbolStyle: SymbolStyle,
	palette: ChartPalette,
	sizePx: number,
	pixelRatio: number,
): { png: Buffer; json: Record<string, SpriteAtlasEntry> } {
	const icons = ICONS.map((spec) => rasterizeIcon(spec, symbolStyle, palette, sizePx));

	// potpack mutates each box with x/y in place; boxes carry a back-reference to the icon since
	// potpack's box shape (w/h) differs from RasterizedIcon's own width/height fields, and x/y are
	// declared here (not just inferred) so the mutation potpack performs is visible on this type.
	const boxes: { w: number; h: number; x?: number; y?: number; icon: RasterizedIcon }[] =
		icons.map((icon) => ({ w: icon.width, h: icon.height, icon }));
	const { w: atlasWidth, h: atlasHeight } = potpack(boxes);
	for (const box of boxes) {
		box.icon.x = box.x ?? 0;
		box.icon.y = box.y ?? 0;
	}

	const png = new PNG({ width: atlasWidth, height: atlasHeight });
	png.data.fill(0);
	for (const icon of icons) {
		for (let row = 0; row < icon.height; row++) {
			const srcStart = row * icon.width * 4;
			const destStart = ((icon.y + row) * atlasWidth + icon.x) * 4;
			icon.pixels.copy(png.data, destStart, srcStart, srcStart + icon.width * 4);
		}
	}

	const json: Record<string, SpriteAtlasEntry> = {};
	for (const icon of icons) {
		json[icon.key] = {
			width: icon.width,
			height: icon.height,
			x: icon.x,
			y: icon.y,
			pixelRatio,
			sdf: false,
		};
	}

	return { png: PNG.sync.write(png), json };
}

const SYMBOL_STYLES: SymbolStyle[] = ["simplified", "traditional"];
const PALETTES = Object.keys(S52_PALETTES) as ChartPalette[];
const BASE_ICON_SIZE_PX = 24;

mkdirSync(OUTPUT_DIR, { recursive: true });

for (const symbolStyle of SYMBOL_STYLES) {
	for (const palette of PALETTES) {
		const baseName = `${symbolStyle}-${palette}`;

		const atlas1x = buildAtlas(symbolStyle, palette, BASE_ICON_SIZE_PX, 1);
		writeFileSync(join(OUTPUT_DIR, `${baseName}.png`), atlas1x.png);
		writeFileSync(join(OUTPUT_DIR, `${baseName}.json`), JSON.stringify(atlas1x.json));

		const atlas2x = buildAtlas(symbolStyle, palette, BASE_ICON_SIZE_PX * 2, 2);
		writeFileSync(join(OUTPUT_DIR, `${baseName}@2x.png`), atlas2x.png);
		writeFileSync(join(OUTPUT_DIR, `${baseName}@2x.json`), JSON.stringify(atlas2x.json));

		console.log(`wrote ${baseName} (${String(ICONS.length)} icons)`);
	}
}
