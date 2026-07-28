import type { ComponentType } from "react";
import type { WidgetViewMode } from "./ViewModeToggle.js";
import { BatteryWidget } from "./BatteryWidget.js";
import { GnssWidget } from "./GnssWidget.js";
import { ThrusterWidget } from "./ThrusterWidget.js";
import { LidarWidget } from "./LidarWidget.js";
import { CameraWidget } from "./CameraWidget.js";
import { MapWidget } from "./MapWidget.js";
import { MissionWidget } from "./MissionWidget.js";
import { MissionControlWidget } from "./MissionControlWidget.js";
import { RosCommandWidget } from "./RosCommandWidget.js";
import { EnclosureHealthWidget } from "./EnclosureHealthWidget.js";
import { RcRemoteWidget } from "./RcRemoteWidget.js";
import { RadarWidget } from "./RadarWidget.js";
import { ImuWidget } from "./ImuWidget.js";
import { LightBeaconWidget } from "./LightBeaconWidget.js";
import { ObiBatteryHorizontal75 } from "@oicl/openbridge-webcomponents-react/icons/icon-battery-horizontal-75.js";
import { ObiLocation } from "@oicl/openbridge-webcomponents-react/icons/icon-location.js";
import { ObiPropulsionAzimuthThruster } from "@oicl/openbridge-webcomponents-react/icons/icon-propulsion-azimuth-thruster.js";
import { ObiRadarIec } from "@oicl/openbridge-webcomponents-react/icons/icon-radar-iec.js";
import { ObiCamera } from "@oicl/openbridge-webcomponents-react/icons/icon-camera.js";
import { ObiChart } from "@oicl/openbridge-webcomponents-react/icons/icon-chart.js";
import { ObiNavigationRoute } from "@oicl/openbridge-webcomponents-react/icons/icon-navigation-route.js";
import { ObiMonitoringRoute } from "@oicl/openbridge-webcomponents-react/icons/icon-monitoring-route.js";
import { ObiCodeGoogle } from "@oicl/openbridge-webcomponents-react/icons/icon-code-google.js";
import { ObiMonitoring } from "@oicl/openbridge-webcomponents-react/icons/icon-monitoring.js";
import { ObiJoystick } from "@oicl/openbridge-webcomponents-react/icons/icon-joystick.js";
import { ObiSensorGyro } from "@oicl/openbridge-webcomponents-react/icons/icon-sensor-gyro.js";
import { ObiLightAlarm } from "@oicl/openbridge-webcomponents-react/icons/icon-light-alarm.js";
import { ObiChartLayers } from "@oicl/openbridge-webcomponents-react/icons/icon-chart-layers.js";
import { ObiTransformRotate } from "@oicl/openbridge-webcomponents-react/icons/icon-transform-rotate.js";

export type WidgetId =
	| "battery"
	| "gnss"
	| "thruster"
	| "lidar"
	| "camera"
	| "map"
	| "mission"
	| "mission_control"
	| "ros_commands"
	| "enclosure_health"
	| "rc_remote"
	| "radar"
	| "imu"
	| "light_beacon";

// OpenBridge's own convention for most of its layouts, matching TileGrid.tsx's GRID_CONFIG.cols;
// the two must stay in sync (LayoutContext.tsx's backfill positioning also depends on this).
export const GRID_COLS = 6;

export interface TilePosition {
	x: number;
	y: number;
	w: number;
	h: number;
}

// Overrides TileCard's default "detailed"/"instrument" icon+wording on the view-mode toggle
// button for widgets where that pair of states means something other than a detail-level split
// (e.g. lidar's 2D/3D views).
export interface ViewModeToggleConfig {
	detailedLabel: string; // used in "Switch to {label} view" tooltip/aria-label wording
	instrumentLabel: string;
	DetailedIcon: ComponentType; // rendered when current mode is "instrument" (switching TO detailed)
	InstrumentIcon: ComponentType; // rendered when current mode is "detailed" (switching TO instrument)
}

export interface WidgetDefinition {
	id: WidgetId;
	label: string;
	// viewMode is only ever passed when supportsViewModeToggle is true below; every widget
	// component accepts it as optional (and most simply never declare/read it) so this stays one
	// uniform type instead of a per-widget component type TileGrid would need to narrow.
	component: ComponentType<{ viewMode?: WidgetViewMode }>;
	icon: ComponentType<{ slot?: string }>;
	defaultW: number;
	defaultH: number;
	minW?: number;
	minH?: number;
	// Whether this widget has an instrument/detailed view toggle. When true, TileGrid renders the
	// single mirrored toggle button in TileCard's title bar (see TileCard.tsx) and passes the
	// current mode down as this widget's viewMode prop, instead of the widget owning that state
	// itself -- TileCard's title bar is where the button lives, so the state has to live at least
	// as high as TileGrid to reach both TileCard and the widget.
	supportsViewModeToggle?: boolean;
	// Only meaningful when supportsViewModeToggle is true. Omit to use TileCard's default
	// detailed/instrument icon+wording.
	viewModeToggle?: ViewModeToggleConfig;
	// Only meaningful when supportsViewModeToggle is true. Omit to use TileGrid's shared
	// DEFAULT_VIEW_MODE ("instrument") -- override when a widget's two states aren't equally
	// good starting points (e.g. lidar defaults to "detailed"/2D, since 3D is heavier to render
	// and less useful for an at-a-glance first look).
	defaultViewMode?: WidgetViewMode;
	// This widget's tile in the built-in "Default" dashboard layout (LayoutContext.tsx's
	// DEFAULT_TILES is derived from these). Curated by hand, and not always the same size as
	// defaultW/defaultH above -- that's the size a widget gets when freshly re-added via the
	// picker after being removed, a different concern from its place in the curated layout.
	defaultPosition: TilePosition;
	// This widget's tile in the built-in "Instruments only" template (LayoutContext.tsx's
	// BUILTIN_TEMPLATES), if it appears there at all. Widgets with no entry here are derived as
	// hidden in that template, rather than needing a second hand-maintained hiddenWidgets list
	// that can silently drift out of sync with this one (see git history for the bug that caused).
	instrumentsOnlyPosition?: TilePosition;
}

export const WIDGET_REGISTRY: Record<WidgetId, WidgetDefinition> = {
	battery: {
		id: "battery",
		label: "Battery",
		component: BatteryWidget,
		icon: ObiBatteryHorizontal75,
		defaultW: 2,
		defaultH: 5,
		minW: 1,
		minH: 1,
		defaultPosition: { x: 0, y: 0, w: 2, h: 5 },
		instrumentsOnlyPosition: { x: 0, y: 0, w: 2, h: 5 },
	},
	gnss: {
		id: "gnss",
		label: "GNSS",
		component: GnssWidget,
		icon: ObiLocation,
		defaultW: 2,
		defaultH: 5,
		minW: 1,
		minH: 1,
		defaultPosition: { x: 2, y: 0, w: 2, h: 5 },
		instrumentsOnlyPosition: { x: 2, y: 0, w: 2, h: 5 },
		supportsViewModeToggle: true,
	},
	thruster: {
		id: "thruster",
		label: "Thrusters",
		component: ThrusterWidget,
		icon: ObiPropulsionAzimuthThruster,
		defaultW: 2,
		defaultH: 7,
		minW: 1,
		minH: 4,
		defaultPosition: { x: 4, y: 0, w: 2, h: 7 },
		instrumentsOnlyPosition: { x: 0, y: 5, w: 2, h: 7 },
		supportsViewModeToggle: true,
	},
	lidar: {
		id: "lidar",
		label: "LiDAR",
		component: LidarWidget,
		icon: ObiRadarIec,
		defaultW: 2,
		defaultH: 5,
		minW: 1,
		minH: 2,
		defaultPosition: { x: 0, y: 5, w: 2, h: 5 },
		instrumentsOnlyPosition: { x: 2, y: 5, w: 2, h: 5 },
		// Reuses the instrument/detailed toggle mechanism for a 2D/3D view switch instead --
		// "detailed" means the 2D top-down canvas, "instrument" means the 3D point cloud scene.
		supportsViewModeToggle: true,
		viewModeToggle: {
			detailedLabel: "2D",
			instrumentLabel: "3D",
			DetailedIcon: ObiChartLayers,
			InstrumentIcon: ObiTransformRotate,
		},
		// 2D by default -- lighter to render and more useful for an at-a-glance first look than
		// starting in the 3D scene.
		defaultViewMode: "detailed",
	},
	camera: {
		id: "camera",
		label: "Camera",
		component: CameraWidget,
		icon: ObiCamera,
		defaultW: 2,
		defaultH: 8,
		minW: 1,
		minH: 1,
		// Deliberately not the same size as defaultW/defaultH (2x8). The curated dashboard
		// layout has always shown this tile smaller (2x7) than what re-adding it via the picker
		// gives you.
		defaultPosition: { x: 2, y: 5, w: 2, h: 7 },
	},
	map: {
		id: "map",
		label: "Map",
		component: MapWidget,
		icon: ObiChart,
		defaultW: 3,
		defaultH: 8,
		minW: 1,
		minH: 1,
		defaultPosition: { x: 0, y: 12, w: 3, h: 8 },
	},
	mission: {
		id: "mission",
		label: "Mission",
		component: MissionWidget,
		icon: ObiNavigationRoute,
		defaultW: 2,
		defaultH: 8,
		minW: 2,
		minH: 4,
		// Narrower here (w:2) than in the dedicated Mission app, where it gets a full column
		// (w:3, see apps.ts's MISSION_TILES) since it's sharing the customizable dashboard with
		// other widgets rather than being the primary focus of the view.
		defaultPosition: { x: 3, y: 12, w: 2, h: 8 },
	},
	mission_control: {
		id: "mission_control",
		label: "Mission Control",
		component: MissionControlWidget,
		icon: ObiMonitoringRoute,
		defaultW: 2,
		defaultH: 6,
		minW: 2,
		minH: 4,
		defaultPosition: { x: 3, y: 20, w: 2, h: 6 },
	},
	ros_commands: {
		id: "ros_commands",
		label: "ROS Commands",
		component: RosCommandWidget,
		icon: ObiCodeGoogle,
		defaultW: 2,
		defaultH: 8,
		minW: 2,
		minH: 5,
		defaultPosition: { x: 0, y: 20, w: 2, h: 8 },
		// No instrumentsOnlyPosition -- an operator/debug tool, not an at-a-glance instrument,
		// same as map/mission/mission_control.
	},
	enclosure_health: {
		id: "enclosure_health",
		label: "Enclosure Health",
		component: EnclosureHealthWidget,
		icon: ObiMonitoring,
		defaultW: 2,
		defaultH: 5,
		minW: 1,
		minH: 3,
		defaultPosition: { x: 0, y: 28, w: 3, h: 5 },
		supportsViewModeToggle: true,
	},
	rc_remote: {
		id: "rc_remote",
		label: "RC Remote",
		component: RcRemoteWidget,
		icon: ObiJoystick,
		defaultW: 2,
		defaultH: 4,
		minW: 1,
		minH: 3,
		defaultPosition: { x: 3, y: 28, w: 3, h: 4 },
	},
	radar: {
		id: "radar",
		label: "Radar",
		component: RadarWidget,
		icon: ObiRadarIec,
		defaultW: 2,
		defaultH: 5,
		minW: 1,
		minH: 2,
		defaultPosition: { x: 0, y: 33, w: 3, h: 5 },
	},
	imu: {
		id: "imu",
		label: "IMU",
		component: ImuWidget,
		icon: ObiSensorGyro,
		defaultW: 2,
		defaultH: 4,
		minW: 1,
		minH: 3,
		defaultPosition: { x: 3, y: 33, w: 3, h: 4 },
		supportsViewModeToggle: true,
	},
	light_beacon: {
		id: "light_beacon",
		label: "Light Beacon",
		component: LightBeaconWidget,
		icon: ObiLightAlarm,
		defaultW: 2,
		defaultH: 4,
		minW: 1,
		minH: 3,
		// enclosure_health/rc_remote (row at y:28) and radar/imu (row at y:33) above each pair
		// off at half-width (w:3) instead of the old 4-across quarter-width row. A 6-column
		// grid can't fit 4 tiles side by side at a readable width, so this splits them into two
		// half-width rows instead. This widget starts a third row below the taller of the two
		// (radar, h:5).
		defaultPosition: { x: 0, y: 38, w: 3, h: 4 },
	},
};

export const ALL_WIDGET_IDS: WidgetId[] = [
	"battery",
	"gnss",
	"thruster",
	"lidar",
	"camera",
	"map",
	"mission",
	"mission_control",
	"ros_commands",
	"enclosure_health",
	"rc_remote",
	"radar",
	"imu",
	"light_beacon",
];

// A widget's placement within some concrete layout (the customizable dashboard, a saved
// template, or a locked app): TilePosition plus which widget it belongs to. Lives here, not in
// LayoutContext.tsx where it originated, so apps.ts can share it without importing from
// LayoutContext.tsx, which itself imports from this file.
export interface TileLayout extends TilePosition {
	i: WidgetId;
}

// Every widget with an instrumentsOnlyPosition gets a tile there; every other widget is derived
// as hidden, structurally, not by hand-listing both a tiles array and a hiddenWidgets array
// that must together cover every widget id (this app shipped with exactly that bug once:
// mission_control was missing from both hand-maintained lists, so loading the "Instruments only"
// template left it neither shown nor tracked as hidden). Shared by LayoutContext.tsx's remaining
// templates and apps.ts's Instruments app, so the two can't drift apart from each other.
export function deriveInstrumentsOnlyTiles(): TileLayout[] {
	return ALL_WIDGET_IDS.flatMap((id) => {
		const position = WIDGET_REGISTRY[id].instrumentsOnlyPosition;
		return position ? [{ i: id, ...position }] : [];
	});
}

export function deriveInstrumentsOnlyHidden(): WidgetId[] {
	return ALL_WIDGET_IDS.filter((id) => !WIDGET_REGISTRY[id].instrumentsOnlyPosition);
}
