import type { MissionExecutionStatusMsg } from "@revolt/shared-types";
import { useBridgeData } from "../context/useBridgeData.js";

/**
 * The live mission_execution_status broadcast, scoped to missionId. Null if nothing is
 * currently tracked, or the broadcast currently on the wire describes a different mission.
 */
export function useMissionExecutionStatus(
	missionId: string | null,
): MissionExecutionStatusMsg | null {
	const { missionExecutionStatus } = useBridgeData();
	return missionId && missionExecutionStatus?.mission_id === missionId
		? missionExecutionStatus
		: null;
}
