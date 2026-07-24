import { describe, expect, it } from "vitest";
import type { MissionExecutionStatusMsg } from "@revolt/shared-types";
import { bridgeDataReducer, initialData } from "./bridgeDataReducer.js";

function makeExecutionStatusMsg(
	overrides: Partial<MissionExecutionStatusMsg> = {},
): MissionExecutionStatusMsg {
	return {
		v: "1",
		type: "mission_execution_status",
		timestamp_ms: 1000,
		mission_id: "mission-1",
		state: "active",
		current_waypoint_seq: 2,
		remaining_count: 3,
		total_count: 5,
		...overrides,
	};
}

describe("bridgeDataReducer / mission_execution_status", () => {
	it("stores the message under missionExecutionStatus", () => {
		const msg = makeExecutionStatusMsg();
		const next = bridgeDataReducer(initialData, msg);
		expect(next.missionExecutionStatus).toBe(msg);
	});

	it("leaves the rest of the state untouched", () => {
		const state = { ...initialData, wsConnected: true };
		const next = bridgeDataReducer(state, makeExecutionStatusMsg());
		expect(next.wsConnected).toBe(true);
		expect(next.battery).toBeNull();
	});

	it("replaces a previous execution status with a newer one", () => {
		const first = bridgeDataReducer(initialData, makeExecutionStatusMsg({ state: "starting" }));
		const second = bridgeDataReducer(
			first,
			makeExecutionStatusMsg({ state: "active", remaining_count: 2 }),
		);
		expect(second.missionExecutionStatus?.state).toBe("active");
		expect(second.missionExecutionStatus?.remaining_count).toBe(2);
	});

	it("initialData starts with no execution status", () => {
		expect(initialData.missionExecutionStatus).toBeNull();
	});
});
