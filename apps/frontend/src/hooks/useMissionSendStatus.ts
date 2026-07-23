import type { MissionSendStatusMsg } from "@revolt/shared-types";
import { useBridgeData } from "../context/useBridgeData.js";

/**
 * The live mission_send_status broadcast, scoped to missionId -- null if nothing has been sent
 * yet this session, or the broadcast currently on the wire describes a different mission.
 */
export function useMissionSendStatus(missionId: string | null): MissionSendStatusMsg | null {
	const { missionSendStatus } = useBridgeData();
	return missionId && missionSendStatus?.mission_id === missionId ? missionSendStatus : null;
}
