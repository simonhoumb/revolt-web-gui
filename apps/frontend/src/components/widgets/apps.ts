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

// Focused instrument cluster, not a full sensor dashboard -- connection/system status is already
// always visible in the top bar regardless of which app is active, so Conning doesn't repeat it.
const CONNING_TILES: TileLayout[] = [
	{ i: "gnss", x: 0, y: 0, w: 4, h: 6 },
	{ i: "thruster", x: 4, y: 0, w: 4, h: 6 },
	{ i: "imu", x: 8, y: 0, w: 4, h: 6 },
	{ i: "map", x: 0, y: 6, w: 12, h: 8 },
];

const MISSION_TILES: TileLayout[] = [
	{ i: "mission", x: 0, y: 0, w: 5, h: 12 },
	{ i: "mission_control", x: 5, y: 0, w: 7, h: 6 },
	{ i: "map", x: 5, y: 6, w: 7, h: 6 },
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
		tiles: deriveInstrumentsOnlyTiles(),
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
