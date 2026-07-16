import type { RosCommandMeta, RosCommandResult } from "@revolt/shared-types";
import { apiFetch } from "./api.js";

// Thrown by rosCommandApi.execute() for the 404 "unknown command_id" case.
export class RosCommandNotFoundError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RosCommandNotFoundError";
	}
}

// Thrown by rosCommandApi.execute() for the 400 "missing/disallowed param" case (e.g. a topic
// that isn't in the backend's allow-list for the live bridge target).
export class RosCommandInvalidParamsError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RosCommandInvalidParamsError";
	}
}

interface RosCommandErrorDetail {
	detail?: string;
}

async function throwRosCommandError(res: Response, fallbackMessage: string): Promise<never> {
	const body = (await res.json().catch(() => ({}))) as RosCommandErrorDetail;
	const message = body.detail ?? fallbackMessage;
	if (res.status === 404) {
		throw new RosCommandNotFoundError(message);
	}
	throw new RosCommandInvalidParamsError(message);
}

async function handleJson<T>(res: Response): Promise<T> {
	if (!res.ok) {
		throw new Error(`ROS command API request failed: ${String(res.status)} ${res.statusText}`);
	}
	return (await res.json()) as T;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export const rosCommandApi = {
	async list(): Promise<RosCommandMeta[]> {
		return handleJson<RosCommandMeta[]>(await apiFetch("/api/ros-commands"));
	},

	async execute(commandId: string, params: Record<string, string>): Promise<RosCommandResult> {
		const res = await apiFetch(`/api/ros-commands/${encodeURIComponent(commandId)}`, {
			method: "POST",
			headers: JSON_HEADERS,
			body: JSON.stringify({ params }),
		});
		if (res.status === 404 || res.status === 400) {
			return throwRosCommandError(res, "ROS command request failed.");
		}
		return handleJson<RosCommandResult>(res);
	},
};
