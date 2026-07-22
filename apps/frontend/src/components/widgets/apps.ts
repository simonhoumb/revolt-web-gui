import type { ComponentType } from "react";
import { ObiConningIec } from "@oicl/openbridge-webcomponents-react/icons/icon-conning-iec.js";
import { ObiSpeed } from "@oicl/openbridge-webcomponents-react/icons/icon-speed.js";
import { ObiNavigationRoute } from "@oicl/openbridge-webcomponents-react/icons/icon-navigation-route.js";
import { ObiDashboard } from "@oicl/openbridge-webcomponents-react/icons/icon-dashboard.js";
import { type TileLayout, deriveInstrumentsOnlyTiles } from "./registry.js";

export type AppId = "conning" | "instruments" | "mission" | "custom";

export interface LockedAppDefinition {
	id: Exclude<AppId, "custom">;
	label: string;
	icon: ComponentType<{ slot?: string }>;
	kind: "locked";
	tiles: TileLayout[];
}

export interface CustomAppDefinition {
	id: "custom";
	label: string;
	icon: ComponentType<{ slot?: string }>;
	kind: "custom";
}

export type AppDefinition = LockedAppDefinition | CustomAppDefinition;

// Focused instrument cluster, not a full sensor dashboard. Connection/system status is already
// always visible in the top bar regardless of which app is active, so Conning doesn't repeat it.
const CONNING_TILES: TileLayout[] = [
	{ i: "gnss", x: 0, y: 0, w: 2, h: 9 },
	{ i: "lidar", x: 0, y: 9, w: 1, h: 7 },
	{ i: "radar", x: 1, y: 9, w: 1, h: 7 },
	{ i: "imu", x: 0, y: 16, w: 1, h: 6 },
	{ i: "enclosure_health", x: 1, y: 16, w: 1, h: 6 },
	{ i: "camera", x: 2, y: 0, w: 2, h: 11 },
	{ i: "map", x: 2, y: 11, w: 2, h: 11 },
	{ i: "thruster", x: 4, y: 0, w: 2, h: 22 },
];

const MISSION_TILES: TileLayout[] = [
	{ i: "mission", x: 0, y: 0, w: 2, h: 17 },
	{ i: "mission_control", x: 0, y: 17, w: 2, h: 5 },
	{ i: "map", x: 2, y: 0, w: 4, h: 22 },
];

export const APPS: Record<AppId, AppDefinition> = {
	conning: {
		id: "conning",
		label: "Conning",
		icon: ObiConningIec,
		kind: "locked",
		tiles: CONNING_TILES,
	},
	instruments: {
		id: "instruments",
		label: "Instruments",
		icon: ObiSpeed,
		kind: "locked",
		// Reuses the same registry-derived tiles the old "Instruments only" template used, so this
		// app and LayoutContext's Default template can never hand-list the same widget set twice.
		// A getter, not an eagerly-computed value: registry.ts imports every widget component
		// (including ThrusterWidget/ImuWidget/GnssWidget, which import useApps from
		// AppContext.tsx, which imports this file, which imports registry.ts), a genuine
		// circular import. Calling deriveInstrumentsOnlyTiles() at this module's top level would
		// run mid-cycle, while registry.ts is still mid-evaluation and hasn't defined it yet.
		// Deferring the call to first access (which only ever happens later, e.g. during render)
		// lets the whole module graph finish loading first.
		get tiles() {
			return deriveInstrumentsOnlyTiles();
		},
	},
	mission: {
		id: "mission",
		label: "Mission",
		icon: ObiNavigationRoute,
		kind: "locked",
		tiles: MISSION_TILES,
	},
	custom: {
		id: "custom",
		label: "Customizable Dashboard",
		icon: ObiDashboard,
		kind: "custom",
	},
};

export const ALL_APP_IDS: AppId[] = ["conning", "instruments", "mission", "custom"];
