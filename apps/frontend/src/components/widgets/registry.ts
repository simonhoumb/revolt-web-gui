import type { ComponentType } from "react";
import { BatteryWidget } from "./BatteryWidget.js";
import { GnssWidget } from "./GnssWidget.js";
import { ThrusterWidget } from "./ThrusterWidget.js";
import { ConnectionWidget } from "./ConnectionWidget.js";
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
import { ObiCellFull } from "@oicl/openbridge-webcomponents-react/icons/icon-cell-full.js";
import { ObiRadarIec } from "@oicl/openbridge-webcomponents-react/icons/icon-radar-iec.js";
import { ObiCamera } from "@oicl/openbridge-webcomponents-react/icons/icon-camera.js";
import { ObiChart } from "@oicl/openbridge-webcomponents-react/icons/icon-chart.js";
import { ObiNavigationRoute } from "@oicl/openbridge-webcomponents-react/icons/icon-navigation-route.js";
import { ObiMonitoringRoute } from "@oicl/openbridge-webcomponents-react/icons/icon-monitoring-route.js";
import { ObiLogEditGoogle } from "@oicl/openbridge-webcomponents-react/icons/icon-log-edit-google.js";
import { ObiHvac } from "@oicl/openbridge-webcomponents-react/icons/icon-hvac.js";
import { ObiJoystick } from "@oicl/openbridge-webcomponents-react/icons/icon-joystick.js";
import { ObiRadarStandbyIec } from "@oicl/openbridge-webcomponents-react/icons/icon-radar-standby-iec.js";
import { ObiSensorGyro } from "@oicl/openbridge-webcomponents-react/icons/icon-sensor-gyro.js";
import { ObiLightBulbOn } from "@oicl/openbridge-webcomponents-react/icons/icon-light-bulb-on.js";

export type WidgetId =
	| "battery"
	| "gnss"
	| "thruster"
	| "connection"
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

export interface TilePosition {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface WidgetDefinition {
	id: WidgetId;
	label: string;
	component: ComponentType;
	icon: ComponentType<{ slot?: string }>;
	defaultW: number;
	defaultH: number;
	minW?: number;
	minH?: number;
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
		defaultW: 3,
		defaultH: 5,
		minW: 2,
		minH: 3,
		defaultPosition: { x: 0, y: 0, w: 3, h: 5 },
		instrumentsOnlyPosition: { x: 0, y: 0, w: 4, h: 5 },
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
		defaultPosition: { x: 3, y: 0, w: 3, h: 5 },
		instrumentsOnlyPosition: { x: 4, y: 0, w: 4, h: 5 },
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
		defaultPosition: { x: 6, y: 4, w: 3, h: 7 },
		instrumentsOnlyPosition: { x: 0, y: 5, w: 4, h: 7 },
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
		defaultPosition: { x: 6, y: 0, w: 3, h: 4 },
		instrumentsOnlyPosition: { x: 8, y: 0, w: 4, h: 4 },
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
		defaultPosition: { x: 3, y: 5, w: 3, h: 5 },
		instrumentsOnlyPosition: { x: 4, y: 5, w: 4, h: 5 },
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
		// Deliberately not the same size as defaultW/defaultH (4x8) -- the curated dashboard
		// layout has always shown this tile smaller (3x7) than what re-adding it via the picker
		// gives you.
		defaultPosition: { x: 0, y: 5, w: 3, h: 7 },
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
		defaultPosition: { x: 0, y: 12, w: 6, h: 8 },
	},
	mission: {
		id: "mission",
		label: "Mission",
		component: MissionWidget,
		icon: ObiNavigationRoute,
		defaultW: 3,
		defaultH: 8,
		minW: 3,
		minH: 4,
		// See camera's note above -- the curated layout is wider (4) than defaultW (3).
		defaultPosition: { x: 6, y: 12, w: 4, h: 8 },
	},
	mission_control: {
		id: "mission_control",
		label: "Mission Control",
		component: MissionControlWidget,
		icon: ObiMonitoringRoute,
		defaultW: 3,
		defaultH: 6,
		minW: 3,
		minH: 4,
		// See camera's note above -- the curated layout is wider (4) than defaultW (3).
		defaultPosition: { x: 6, y: 20, w: 4, h: 6 },
	},
	ros_commands: {
		id: "ros_commands",
		label: "ROS Commands",
		component: RosCommandWidget,
		icon: ObiLogEditGoogle,
		defaultW: 4,
		defaultH: 8,
		minW: 3,
		minH: 5,
		defaultPosition: { x: 0, y: 20, w: 4, h: 8 },
		// No instrumentsOnlyPosition -- an operator/debug tool, not an at-a-glance instrument,
		// same as map/mission/mission_control.
	},
	enclosure_health: {
		id: "enclosure_health",
		label: "Enclosure Health",
		component: EnclosureHealthWidget,
		icon: ObiHvac,
		defaultW: 3,
		defaultH: 5,
		minW: 2,
		minH: 3,
		defaultPosition: { x: 0, y: 28, w: 3, h: 5 },
	},
	rc_remote: {
		id: "rc_remote",
		label: "RC Remote",
		component: RcRemoteWidget,
		icon: ObiJoystick,
		defaultW: 3,
		defaultH: 4,
		minW: 2,
		minH: 3,
		// Placed beside enclosure_health rather than reusing its own x:0,y:28 slot -- both
		// widgets picked the same "first free spot after the curated layout" coordinates
		// independently since they were built on parallel branches.
		defaultPosition: { x: 3, y: 28, w: 3, h: 4 },
	},
	radar: {
		id: "radar",
		label: "Radar",
		component: RadarWidget,
		icon: ObiRadarStandbyIec,
		defaultW: 3,
		defaultH: 5,
		minW: 3,
		minH: 5,
		// Same "first free spot" collision as rc_remote above -- moved off enclosure_health's
		// x:0,y:28 slot to avoid overlapping it.
		defaultPosition: { x: 6, y: 28, w: 3, h: 5 },
	},
	imu: {
		id: "imu",
		label: "IMU",
		component: ImuWidget,
		icon: ObiSensorGyro,
		defaultW: 3,
		defaultH: 4,
		minW: 2,
		minH: 3,
		// Next free spot in the row started by enclosure_health/rc_remote/radar above.
		defaultPosition: { x: 9, y: 28, w: 3, h: 4 },
	},
	light_beacon: {
		id: "light_beacon",
		label: "Light Beacon",
		component: LightBeaconWidget,
		icon: ObiLightBulbOn,
		defaultW: 3,
		defaultH: 4,
		minW: 2,
		minH: 3,
		// enclosure_health/rc_remote/radar/imu above fill the entire y:28 row (0-3, 3-6, 6-9,
		// 9-12); this widget starts a new row below the tallest of them (enclosure_health/radar,
		// h:5).
		defaultPosition: { x: 0, y: 33, w: 3, h: 4 },
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
	"mission_control",
	"ros_commands",
	"enclosure_health",
	"rc_remote",
	"radar",
	"imu",
	"light_beacon",
];
