import { describe, it, expect } from "vitest";
import { S52_PALETTES, s52Color, type ChartPalette, type S52ColorTokens } from "./s52Colors.js";

const PALETTES: ChartPalette[] = ["night", "dusk", "day", "bright"];
const TOKENS: (keyof S52ColorTokens)[] = [
	"depvs",
	"depms",
	"depmd",
	"depdw",
	"depit",
	"depsc",
	"cstln",
	"landa",
	"landf",
	"chblk",
	"chgrd",
	"chwht",
	"chred",
	"chgrn",
	"chylw",
	"chmgd",
	"chmgf",
	"sndg1",
	"sndg2",
	"ships",
	"nodta",
];

const HEX_COLOR = /^#[0-9a-f]{6}$/;

describe("s52Colors", () => {
	it.each(PALETTES)("defines every token for the %s palette as a valid hex color", (palette) => {
		for (const token of TOKENS) {
			expect(S52_PALETTES[palette][token]).toMatch(HEX_COLOR);
		}
	});

	it("s52Color looks up the same value as direct indexing", () => {
		expect(s52Color("night", "depvs")).toBe(S52_PALETTES.night.depvs);
	});

	it("night is darker than bright for every depth-shading token, matching S-52's dark-adaptation intent", () => {
		// Darker = smaller sum of RGB channel values; a coarse but sufficient proxy here, not
		// intended as a perceptual-luminance formula.
		function channelSum(hex: string): number {
			return (
				Number.parseInt(hex.slice(1, 3), 16) +
				Number.parseInt(hex.slice(3, 5), 16) +
				Number.parseInt(hex.slice(5, 7), 16)
			);
		}
		for (const token of ["depvs", "depms", "depdw"] as const) {
			expect(channelSum(S52_PALETTES.night[token])).toBeLessThan(
				channelSum(S52_PALETTES.bright[token]),
			);
		}
	});
});
