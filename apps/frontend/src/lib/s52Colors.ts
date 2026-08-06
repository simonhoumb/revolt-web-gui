/**
 * IHO S-52 Presentation Library color tokens for the four chart palettes this app supports.
 *
 * Values are derived from a real S-52 color table given in its authoritative form -- CIE 1931 xyY
 * (chromaticity x, y plus luminance Y on a 0-100 scale) -- for the Day, Dusk, and Night palettes,
 * converted to sRGB hex via the standard xyY to XYZ to linear sRGB to gamma-encoded sRGB pipeline
 * (D65 reference white, the standard sRGB primaries matrix). This is a more direct source than
 * hand-picked hex approximations: xyY is how the S-52 spec itself defines color, sRGB hex is just
 * one rendering of it.
 *
 * `bright` has no separate source table (the table provided only has one "Day" entry, not split
 * into Day Bright/White/Black); it's derived by scaling the Day table's luminance by 1.25x before
 * conversion, chosen because it lands CHWHT/DEPDW's luminance (80 in the Day table) exactly at 100
 * -- the reference white's own luminance for this chromaticity -- rather than an arbitrary
 * boost. This is an approximation, not a second real table; note this if a genuine Day Bright table
 * ever turns up.
 *
 * Only tokens this app actually has a feature for are included. Several source-table tokens are
 * deliberately omitted because they're exact xyY duplicates of a token already here (not worth a
 * second field with the same value): LITRD/LITGN/LITYW == CHRED/CHGRN/CHYLW, ISDNG == CHMGD, DNGHL
 * == CHRED, TRFCD == CHMGD. Others are omitted because this app has no corresponding feature to
 * paint with them: radar/ARPA (RADHI/RADLO/ARPAT), ECDIS chrome this app doesn't render on the
 * chart itself (CURSR/SCLBR/CHCOR/NINFO/ADINF/RESGR/RESBL), the chart frame (OUTLW/OUTLL), reserved
 * slots (RES01-03), and backlight-adjustment greys (BKAJ1/BKAJ2, not really a paint color).
 * PLRTE/APLRT (planned/active route) are also omitted on purpose, not just unsupported: mission
 * legs already have a more useful hazard-status color scheme (see useWaypointMarkers.ts's
 * HAZARD_LINE_COLOR), and a flat S-52 route color would be a downgrade, not an upgrade, there.
 */
export type ChartPalette = "night" | "dusk" | "day" | "bright";

/** One S-52 color token per chart element this app renders, as a hex string. */
export interface S52ColorTokens {
	/** DEPVS: depth area shading for water shallower than the shallow-water contour. */
	depvs: string;
	/** DEPMS: depth area shading between the shallow-water contour and the safety contour. */
	depms: string;
	/** DEPMD: depth area shading between the safety contour and the deep-water contour. */
	depmd: string;
	/** DEPDW: depth area shading for water deeper than the deep-water contour. */
	depdw: string;
	/** DEPIT: depth area shading for intertidal (drying) areas, DRVAL1 &lt; 0. */
	depit: string;
	/** DEPSC: the safety contour line itself, and its depth label. */
	depsc: string;
	/** CSTLN: coastline. */
	cstln: string;
	/** LANDA: land area fill. */
	landa: string;
	/** LANDF: land area outline. */
	landf: string;
	/** CHBLK: chart black, used for high-contrast line/text work. */
	chblk: string;
	/** CHGRD: chart grey (dominant), used for muted contours/casings. */
	chgrd: string;
	/** CHWHT: chart white, used for text halos and light backgrounds. */
	chwht: string;
	/** CHRED: red aid-to-navigation color (port lateral marks, red lights). */
	chred: string;
	/** CHGRN: green aid-to-navigation color (starboard lateral marks, green lights). */
	chgrn: string;
	/** CHYLW: yellow aid-to-navigation color (special-purpose marks, cardinal topmarks). */
	chylw: string;
	/** CHMGD: magenta, used for traffic routing scheme lines, restricted-area boundaries, and
	 * isolated-danger marks (CHMGD is xyY-identical to TRFCD and ISDNG in the source table, so this
	 * app doesn't carry separate fields for those). */
	chmgd: string;
	/** CHMGF: secondary (lighter/less saturated) magenta, used for traffic routing scheme area
	 * fills, distinct from CHMGD's line/boundary use (CHMGF is xyY-identical to TRFCF). */
	chmgf: string;
	/** SNDG1: sounding text color for soundings at/deeper than the safety contour. */
	sndg1: string;
	/** SNDG2: sounding text color for soundings shallower than the safety contour (the shoal-alert
	 * variant SOUNDG's real conditional symbology procedure picks out). */
	sndg2: string;
	/** SHIPS: own-ship symbol color (xyY-identical to PSTRK, the past-track color, in the source
	 * table, so this app uses SHIPS for both). */
	ships: string;
	/** NODTA: background / no chart data. */
	nodta: string;
}

/**
 * The four in-scope S-52 palettes. Source: a real S-52 xyY color table for Day/Dusk/Night,
 * converted to sRGB (see this module's own doc comment); `bright` is derived from `day` (see
 * above), not a fourth independent table.
 */
export const S52_PALETTES: Record<ChartPalette, S52ColorTokens> = {
	bright: {
		depvs: "#6ccbff",
		depms: "#90dfff",
		depmd: "#b9f0ff",
		depdw: "#deffff",
		depit: "#62c1ad",
		depsc: "#55666e",
		cstln: "#55666e",
		landa: "#d3d29e",
		landf: "#9c6f34",
		chblk: "#000000",
		chgrd: "#55666e",
		chwht: "#deffff",
		chred: "#ff5e7d",
		chgrn: "#5bff42",
		chylw: "#f8f840",
		chmgd: "#d44de7",
		chmgf: "#e0bbff",
		sndg1: "#839ba7",
		sndg2: "#000000",
		ships: "#000000",
		nodta: "#a3c0cf",
	},
	day: {
		depvs: "#61b7ff",
		depms: "#82caff",
		depmd: "#a7d9fb",
		depdw: "#c9edfe",
		depit: "#58af9c",
		depsc: "#4c5b63",
		cstln: "#4c5b63",
		landa: "#bfbe8f",
		landf: "#8d642e",
		chblk: "#000000",
		chgrd: "#4c5b63",
		chwht: "#c9edfe",
		chred: "#ea5471",
		chgrn: "#52e83b",
		chylw: "#e1e139",
		chmgd: "#c045d1",
		chmgf: "#cba9f9",
		sndg1: "#768c97",
		sndg2: "#000000",
		ships: "#000000",
		nodta: "#93aebb",
	},
	dusk: {
		depvs: "#1e4165",
		depms: "#1d3246",
		depmd: "#0f1b21",
		depdw: "#000000",
		depit: "#234c44",
		depsc: "#6b7f89",
		cstln: "#6b7f89",
		landa: "#40402e",
		landf: "#7f5a29",
		chblk: "#6b7f89",
		chgrd: "#6b7f89",
		chwht: "#8ca6b2",
		chred: "#9b3549",
		chgrn: "#2f8e20",
		chylw: "#8b8b1f",
		chmgd: "#826ca1",
		chmgf: "#772782",
		sndg1: "#4c5b63",
		sndg2: "#8ca6b2",
		ships: "#8ca6b2",
		nodta: "#404d53",
	},
	night: {
		depvs: "#071727",
		depms: "#050e16",
		depmd: "#03070a",
		depdw: "#000000",
		depit: "#0b201c",
		depsc: "#252d31",
		cstln: "#252d31",
		landa: "#17160e",
		landf: "#2f1f0a",
		chblk: "#252d31",
		chgrd: "#252d31",
		chwht: "#364147",
		chred: "#390e16",
		chgrn: "#0c3406",
		chylw: "#323206",
		chmgd: "#411247",
		chmgf: "#411247",
		sndg1: "#181e21",
		sndg2: "#364147",
		ships: "#364147",
		nodta: "#171e21",
	},
};

/** Looks up a single S-52 color token for the given palette. */
export function s52Color(palette: ChartPalette, token: keyof S52ColorTokens): string {
	return S52_PALETTES[palette][token];
}
