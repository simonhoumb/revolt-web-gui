import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import type { Mission, Waypoint } from "@revolt/shared-types";
import { missionApi } from "../lib/missionApi.js";

export interface HazardSummary {
	status: "safe" | "warning" | "blocked";
	description: string;
}

interface MissionContextValue {
	missions: Mission[];
	loading: boolean;
	activeMissionId: string | null;
	activeMission: Mission | null;
	// Keyed by waypoint id (the leg ending at that waypoint). Written by MapWidget's client-side
	// ENC check once that lands; empty until then.
	legValidation: Record<string, HazardSummary>;
	loadMissions: () => Promise<void>;
	createMission: (name: string) => Promise<void>;
	selectMission: (id: string | null) => void;
	renameMission: (id: string, name: string) => Promise<void>;
	deleteMission: (id: string) => Promise<void>;
	addWaypoint: (latitude: number, longitude: number) => Promise<void>;
	updateWaypointPosition: (
		waypointId: string,
		latitude: number,
		longitude: number,
	) => Promise<void>;
	updateWaypointSpeed: (waypointId: string, knots: number) => Promise<void>;
	reorderWaypoints: (orderedWaypointIds: string[]) => Promise<void>;
	deleteWaypoint: (waypointId: string) => Promise<void>;
	setLegValidation: (result: Record<string, HazardSummary>) => void;
}

const MissionContext = createContext<MissionContextValue | null>(null);

function replaceMission(missions: Mission[], updated: Mission): Mission[] {
	return missions.map((m) => (m.id === updated.id ? updated : m));
}

function updateWaypointsIn(
	missions: Mission[],
	missionId: string,
	updater: (waypoints: Waypoint[]) => Waypoint[],
): Mission[] {
	return missions.map((m) =>
		m.id === missionId ? { ...m, waypoints: updater(m.waypoints) } : m,
	);
}

export function MissionProvider({ children }: { children: ReactNode }) {
	const [missions, setMissions] = useState<Mission[]>([]);
	const [loading, setLoading] = useState(false);
	const [activeMissionId, setActiveMissionId] = useState<string | null>(null);
	const [legValidation, setLegValidationState] = useState<Record<string, HazardSummary>>({});

	const loadMissions = useCallback(async () => {
		setLoading(true);
		try {
			const result = await missionApi.list();
			setMissions(result);
			setActiveMissionId((prev) =>
				prev && result.some((m) => m.id === prev) ? prev : (result[0]?.id ?? null),
			);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadMissions();
	}, [loadMissions]);

	const activeMission = useMemo(
		() => missions.find((m) => m.id === activeMissionId) ?? null,
		[missions, activeMissionId],
	);

	const createMission = useCallback(async (name: string) => {
		const mission = await missionApi.create({ name });
		setMissions((prev) => [mission, ...prev]);
		setActiveMissionId(mission.id);
	}, []);

	const selectMission = useCallback((id: string | null) => {
		setActiveMissionId(id);
		setLegValidationState({});
	}, []);

	const renameMission = useCallback(
		async (id: string, name: string) => {
			setMissions((prev) => prev.map((m) => (m.id === id ? { ...m, name } : m)));
			try {
				const updated = await missionApi.update(id, { name });
				setMissions((prev) => replaceMission(prev, updated));
			} catch {
				await loadMissions();
			}
		},
		[loadMissions],
	);

	const deleteMission = useCallback(
		async (id: string) => {
			setMissions((prev) => prev.filter((m) => m.id !== id));
			setActiveMissionId((prev) => (prev === id ? null : prev));
			try {
				await missionApi.remove(id);
			} catch {
				await loadMissions();
			}
		},
		[loadMissions],
	);

	const addWaypoint = useCallback(
		async (latitude: number, longitude: number) => {
			if (!activeMissionId) return;
			// sequence_number is ignored by the backend (it always appends at the end); the schema
			// just requires a non-negative placeholder.
			const waypoint = await missionApi.createWaypoint(activeMissionId, {
				sequence_number: 0,
				latitude,
				longitude,
				target_speed: 5,
			});
			setMissions((prev) =>
				updateWaypointsIn(prev, activeMissionId, (waypoints) => [...waypoints, waypoint]),
			);
		},
		[activeMissionId],
	);

	const updateWaypointPosition = useCallback(
		async (waypointId: string, latitude: number, longitude: number) => {
			if (!activeMissionId) return;
			const missionId = activeMissionId;
			setMissions((prev) =>
				updateWaypointsIn(prev, missionId, (waypoints) =>
					waypoints.map((w) =>
						w.id === waypointId ? { ...w, position: { latitude, longitude } } : w,
					),
				),
			);
			try {
				const updated = await missionApi.updateWaypoint(missionId, waypointId, {
					latitude,
					longitude,
				});
				setMissions((prev) =>
					updateWaypointsIn(prev, missionId, (waypoints) =>
						waypoints.map((w) => (w.id === waypointId ? updated : w)),
					),
				);
			} catch {
				await loadMissions();
			}
		},
		[activeMissionId, loadMissions],
	);

	const updateWaypointSpeed = useCallback(
		async (waypointId: string, knots: number) => {
			if (!activeMissionId) return;
			const missionId = activeMissionId;
			setMissions((prev) =>
				updateWaypointsIn(prev, missionId, (waypoints) =>
					waypoints.map((w) => (w.id === waypointId ? { ...w, target_speed: knots } : w)),
				),
			);
			try {
				const updated = await missionApi.updateWaypoint(missionId, waypointId, {
					target_speed: knots,
				});
				setMissions((prev) =>
					updateWaypointsIn(prev, missionId, (waypoints) =>
						waypoints.map((w) => (w.id === waypointId ? updated : w)),
					),
				);
			} catch {
				await loadMissions();
			}
		},
		[activeMissionId, loadMissions],
	);

	const deleteWaypoint = useCallback(
		async (waypointId: string) => {
			if (!activeMissionId) return;
			const missionId = activeMissionId;
			setMissions((prev) =>
				updateWaypointsIn(prev, missionId, (waypoints) =>
					waypoints.filter((w) => w.id !== waypointId),
				),
			);
			try {
				await missionApi.deleteWaypoint(missionId, waypointId);
				// The backend renumbers remaining sequence_numbers on delete — reload to pick that up.
				await loadMissions();
			} catch {
				await loadMissions();
			}
		},
		[activeMissionId, loadMissions],
	);

	const reorderWaypoints = useCallback(
		async (orderedWaypointIds: string[]) => {
			if (!activeMissionId) return;
			const missionId = activeMissionId;
			const mission = missions.find((m) => m.id === missionId);
			if (!mission) return;
			const byId = new Map(mission.waypoints.map((w) => [w.id, w]));
			const ordered = orderedWaypointIds
				.map((id) => byId.get(id))
				.filter((w): w is Waypoint => w !== undefined);
			setMissions((prev) => updateWaypointsIn(prev, missionId, () => ordered));
			try {
				const payload = ordered.map((w) => ({
					latitude: w.position.latitude,
					longitude: w.position.longitude,
					target_speed: w.target_speed,
					switch_radius: w.switch_radius,
					heading_mode: w.heading_mode,
					heading_deg: w.heading_deg,
				}));
				const waypoints = await missionApi.replaceWaypoints(missionId, payload);
				setMissions((prev) => updateWaypointsIn(prev, missionId, () => waypoints));
			} catch {
				await loadMissions();
			}
		},
		[activeMissionId, missions, loadMissions],
	);

	const setLegValidation = useCallback((result: Record<string, HazardSummary>) => {
		setLegValidationState(result);
	}, []);

	const value = useMemo<MissionContextValue>(
		() => ({
			missions,
			loading,
			activeMissionId,
			activeMission,
			legValidation,
			loadMissions,
			createMission,
			selectMission,
			renameMission,
			deleteMission,
			addWaypoint,
			updateWaypointPosition,
			updateWaypointSpeed,
			reorderWaypoints,
			deleteWaypoint,
			setLegValidation,
		}),
		[
			missions,
			loading,
			activeMissionId,
			activeMission,
			legValidation,
			loadMissions,
			createMission,
			selectMission,
			renameMission,
			deleteMission,
			addWaypoint,
			updateWaypointPosition,
			updateWaypointSpeed,
			reorderWaypoints,
			deleteWaypoint,
			setLegValidation,
		],
	);

	return <MissionContext.Provider value={value}>{children}</MissionContext.Provider>;
}

export function useMission(): MissionContextValue {
	const ctx = useContext(MissionContext);
	if (!ctx) throw new Error("useMission must be used within MissionProvider");
	return ctx;
}
