import type { ComponentType } from "react";
import { BatteryWidget } from "./BatteryWidget.js";
import { GnssWidget } from "./GnssWidget.js";
import { ThrusterWidget } from "./ThrusterWidget.js";
import { ConnectionWidget } from "./ConnectionWidget.js";
import { LidarWidget } from "./LidarWidget.js";
import { CameraWidget } from "./CameraWidget.js";
import { MapWidget } from "./MapWidget.js";
import { MissionWidget } from "./MissionWidget.js";
import { ObiBatteryHorizontal100 } from "@oicl/openbridge-webcomponents-react/icons/icon-battery-horizontal-100.js";
import { ObiLocation } from "@oicl/openbridge-webcomponents-react/icons/icon-location.js";
import { ObiPropulsionAzimuthThruster } from "@oicl/openbridge-webcomponents-react/icons/icon-propulsion-azimuth-thruster.js";
import { ObiCellFull } from "@oicl/openbridge-webcomponents-react/icons/icon-cell-full.js";
import { ObiRadarIec } from "@oicl/openbridge-webcomponents-react/icons/icon-radar-iec.js";
import { ObiCamera } from "@oicl/openbridge-webcomponents-react/icons/icon-camera.js";
import { ObiChart } from "@oicl/openbridge-webcomponents-react/icons/icon-chart.js";
import { ObiNavigationRoute } from "@oicl/openbridge-webcomponents-react/icons/icon-navigation-route.js";

export type WidgetId =
	| "battery"
	| "gnss"
	| "thruster"
	| "connection"
	| "lidar"
	| "camera"
	| "map"
	| "mission";

export interface WidgetDefinition {
	id: WidgetId;
	label: string;
	component: ComponentType;
	icon: ComponentType<{ slot?: string }>;
	defaultW: number;
	defaultH: number;
	minW?: number;
	minH?: number;
}

export const WIDGET_REGISTRY: Record<WidgetId, WidgetDefinition> = {
	battery: {
		id: "battery",
		label: "Battery",
		component: BatteryWidget,
		icon: ObiBatteryHorizontal100,
		defaultW: 3,
		defaultH: 5,
		minW: 2,
		minH: 3,
	},
	gnss: {
		id: "gnss",
		label: "GNSS",
		component: GnssWidget,
		icon: ObiLocation,
		defaultW: 3,
		defaultH: 5,
		minW: 2,
		minH: 3,
	},
	thruster: {
		id: "thruster",
		label: "Thrusters",
		component: ThrusterWidget,
		icon: ObiPropulsionAzimuthThruster,
		defaultW: 3,
		defaultH: 7,
		minW: 2,
		minH: 4,
	},
	connection: {
		id: "connection",
		label: "Connection",
		component: ConnectionWidget,
		icon: ObiCellFull,
		defaultW: 3,
		defaultH: 4,
		minW: 2,
		minH: 3,
	},
	lidar: {
		id: "lidar",
		label: "LiDAR",
		component: LidarWidget,
		icon: ObiRadarIec,
		defaultW: 3,
		defaultH: 5,
		minW: 3,
		minH: 5,
	},
	camera: {
		id: "camera",
		label: "Camera",
		component: CameraWidget,
		icon: ObiCamera,
		defaultW: 4,
		defaultH: 8,
		minW: 3,
		minH: 4,
	},
	map: {
		id: "map",
		label: "Map",
		component: MapWidget,
		icon: ObiChart,
		defaultW: 6,
		defaultH: 8,
		minW: 3,
		minH: 5,
	},
	mission: {
		id: "mission",
		label: "Mission",
		component: MissionWidget,
		icon: ObiNavigationRoute,
		defaultW: 4,
		defaultH: 8,
		minW: 3,
		minH: 4,
	},
};

export const ALL_WIDGET_IDS: WidgetId[] = [
	"battery",
	"gnss",
	"thruster",
	"connection",
	"lidar",
	"camera",
	"map",
	"mission",
];
