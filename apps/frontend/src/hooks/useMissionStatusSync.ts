import { useEffect } from "react";
import { useBridgeData } from "../context/BridgeDataContext.js";

/**
 * Reacts to the mission_send_status broadcast (shared over the WS to every open tab, not just
 * the one that issued the send) by refreshing whichever mission it names, so last_sent_at (and
 * therefore loadedMission) stays fresh everywhere once a send resolves. Ignores the transient
 * "sending" status; only refreshes once the outcome is final.
 */
export function useMissionStatusSync(refreshMission: (missionId: string) => Promise<void>): void {
	const missionSendStatus = useBridgeData().missionSendStatus;
	useEffect(() => {
		if (!missionSendStatus || missionSendStatus.status === "sending") return;
		void refreshMission(missionSendStatus.mission_id);
	}, [missionSendStatus, refreshMission]);
}
