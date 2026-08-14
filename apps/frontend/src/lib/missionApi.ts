import type {
	HazardHit,
	Mission,
	MissionExecutionResult,
	MissionSendResult,
	MissionStatus,
	MissionValidationResult,
	Waypoint,
} from "@revolt/shared-types";
import { apiFetch } from "./api.js";

// Thrown by missionApi.send() specifically for the 409 "route crosses a charted hazard" case, so
// callers can show the operator what's actually wrong instead of a generic failure message.
export class MissionBlockedError extends Error {
	hazards: HazardHit[];

	constructor(message: string, hazards: HazardHit[]) {
		super(message);
		this.name = "MissionBlockedError";
		this.hazards = hazards;
	}
}

// Thrown by missionApi.start() for the 412 "no prior /send has loaded this mission" case.
export class MissionNotLoadedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MissionNotLoadedError";
	}
}

// Thrown by missionApi.send()/start()/pause()/terminate() for the 409 cases guarding the vessel's
// single physical waypoint queue: "another_mission_active" (send while a different mission is
// in-flight) or "stale_mission" (pause/terminate targeting a mission that isn't the tracked one).
export class MissionConflictError extends Error {
	reason: string;

	constructor(message: string, reason: string) {
		super(message);
		this.name = "MissionConflictError";
		this.reason = reason;
	}
}

interface MissionErrorDetail {
	message?: string;
	hazards?: HazardHit[];
	reason?: string;
}

async function throwMissionError(res: Response, fallbackMessage: string): Promise<never> {
	const body = (await res.json()) as { detail?: MissionErrorDetail };
	const message = body.detail?.message ?? fallbackMessage;
	const reason = body.detail?.reason;
	if (reason === "not_loaded") {
		throw new MissionNotLoadedError(message);
	}
	if (reason === "another_mission_active" || reason === "stale_mission") {
		throw new MissionConflictError(message, reason);
	}
	throw new MissionBlockedError(message, body.detail?.hazards ?? []);
}

/** Request body for missionApi.create(). */
export interface MissionCreatePayload {
	name: string;
	description?: string | null;
}

/** Request body for missionApi.update(); unset fields are left unchanged. */
export interface MissionUpdatePayload {
	name?: string;
	description?: string | null;
	status?: MissionStatus;
}

/** Request body for missionApi.createWaypoint(). */
export interface WaypointCreatePayload {
	// Ignored by the create endpoint (server always appends at the end) but required by the
	// backend schema; send a placeholder.
	sequence_number: number;
	latitude: number;
	longitude: number;
	target_speed: number;
	switch_radius?: number;
	heading_mode?: number;
	heading_deg?: number | null;
}

/** Request body for missionApi.updateWaypoint(); unset fields are left unchanged. */
export interface WaypointUpdatePayload {
	latitude?: number;
	longitude?: number;
	target_speed?: number;
	switch_radius?: number;
	heading_mode?: number;
	heading_deg?: number | null;
}

/** Request body for one waypoint within missionApi.replaceWaypoints(). */
export interface WaypointReplacePayload {
	latitude: number;
	longitude: number;
	target_speed: number;
	switch_radius?: number;
	heading_mode?: number;
	heading_deg?: number | null;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

async function handleJson<T>(res: Response): Promise<T> {
	if (!res.ok) {
		throw new Error(`Mission API request failed: ${String(res.status)} ${res.statusText}`);
	}
	return (await res.json()) as T;
}

function handleEmpty(res: Response): void {
	if (!res.ok) {
		throw new Error(`Mission API request failed: ${String(res.status)} ${res.statusText}`);
	}
}

/** REST client for /api/missions: waypoint CRUD plus the validate/send/start/pause/terminate commands. */
export const missionApi = {
	async list(status?: MissionStatus): Promise<Mission[]> {
		const query = status ? `?status=${encodeURIComponent(status)}` : "";
		return handleJson<Mission[]>(await apiFetch(`/api/missions${query}`));
	},

	async create(payload: MissionCreatePayload): Promise<Mission> {
		return handleJson<Mission>(
			await apiFetch("/api/missions", {
				method: "POST",
				headers: JSON_HEADERS,
				body: JSON.stringify(payload),
			}),
		);
	},

	async get(missionId: string): Promise<Mission> {
		return handleJson<Mission>(await apiFetch(`/api/missions/${missionId}`));
	},

	async update(missionId: string, payload: MissionUpdatePayload): Promise<Mission> {
		return handleJson<Mission>(
			await apiFetch(`/api/missions/${missionId}`, {
				method: "PATCH",
				headers: JSON_HEADERS,
				body: JSON.stringify(payload),
			}),
		);
	},

	async remove(missionId: string): Promise<void> {
		handleEmpty(await apiFetch(`/api/missions/${missionId}`, { method: "DELETE" }));
	},

	async createWaypoint(missionId: string, payload: WaypointCreatePayload): Promise<Waypoint> {
		return handleJson<Waypoint>(
			await apiFetch(`/api/missions/${missionId}/waypoints`, {
				method: "POST",
				headers: JSON_HEADERS,
				body: JSON.stringify(payload),
			}),
		);
	},

	async updateWaypoint(
		missionId: string,
		waypointId: string,
		payload: WaypointUpdatePayload,
	): Promise<Waypoint> {
		return handleJson<Waypoint>(
			await apiFetch(`/api/missions/${missionId}/waypoints/${waypointId}`, {
				method: "PATCH",
				headers: JSON_HEADERS,
				body: JSON.stringify(payload),
			}),
		);
	},

	async deleteWaypoint(missionId: string, waypointId: string): Promise<void> {
		handleEmpty(
			await apiFetch(`/api/missions/${missionId}/waypoints/${waypointId}`, {
				method: "DELETE",
			}),
		);
	},

	async replaceWaypoints(
		missionId: string,
		payload: WaypointReplacePayload[],
	): Promise<Waypoint[]> {
		return handleJson<Waypoint[]>(
			await apiFetch(`/api/missions/${missionId}/waypoints`, {
				method: "PUT",
				headers: JSON_HEADERS,
				body: JSON.stringify(payload),
			}),
		);
	},

	async send(missionId: string): Promise<MissionSendResult> {
		const res = await apiFetch(`/api/missions/${missionId}/send`, { method: "POST" });
		if (res.status === 409) {
			return throwMissionError(res, "Route crosses a charted hazard and cannot be sent.");
		}
		return handleJson<MissionSendResult>(res);
	},

	async validate(missionId: string): Promise<MissionValidationResult> {
		return handleJson<MissionValidationResult>(
			await apiFetch(`/api/missions/${missionId}/validate`, { method: "POST" }),
		);
	},

	async start(missionId: string): Promise<MissionExecutionResult> {
		// Re-validates hazards the same way send() does, so it can 409 the same way; 412 means
		// this mission was never (or no longer is) the one loaded via a prior send().
		const res = await apiFetch(`/api/missions/${missionId}/start`, { method: "POST" });
		if (res.status === 409 || res.status === 412) {
			return throwMissionError(res, "Route crosses a charted hazard and cannot be started.");
		}
		return handleJson<MissionExecutionResult>(res);
	},

	async pause(missionId: string): Promise<MissionExecutionResult> {
		const res = await apiFetch(`/api/missions/${missionId}/pause`, { method: "POST" });
		if (res.status === 409) {
			return throwMissionError(res, "This mission is no longer the one being executed.");
		}
		return handleJson<MissionExecutionResult>(res);
	},

	async terminate(missionId: string): Promise<MissionExecutionResult> {
		const res = await apiFetch(`/api/missions/${missionId}/terminate`, { method: "POST" });
		if (res.status === 409) {
			return throwMissionError(res, "This mission is no longer the one being executed.");
		}
		return handleJson<MissionExecutionResult>(res);
	},
};
