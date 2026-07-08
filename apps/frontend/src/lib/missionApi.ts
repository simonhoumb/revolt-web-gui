import type { Mission, MissionStatus, Waypoint } from "@revolt/shared-types";
import { apiFetch } from "./api.js";

export interface MissionCreatePayload {
	name: string;
	description?: string | null;
}

export interface MissionUpdatePayload {
	name?: string;
	description?: string | null;
	status?: MissionStatus;
}

export interface WaypointCreatePayload {
	// Ignored by the create endpoint (server always appends at the end) but required by the
	// backend schema — send a placeholder.
	sequence_number: number;
	latitude: number;
	longitude: number;
	target_speed: number;
	switch_radius?: number;
	heading_mode?: number;
	heading_deg?: number | null;
}

export interface WaypointUpdatePayload {
	latitude?: number;
	longitude?: number;
	target_speed?: number;
	switch_radius?: number;
	heading_mode?: number;
	heading_deg?: number | null;
}

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
};
