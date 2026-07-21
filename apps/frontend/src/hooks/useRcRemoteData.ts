import { useBridgeData } from "../context/BridgeDataContext.js";

// custom_msgs/RCRemote.msg documents throttle/aileron/rudder as raw PWM in the range
// 1070-1930, so 1500 is the stick's own documented center, not a tuned constant.
const PWM_CENTER = 1500;
const PWM_HALF_RANGE = 430;

function toStickPercent(raw: number): number {
	const pct = ((raw - PWM_CENTER) / PWM_HALF_RANGE) * 100;
	return Math.max(-100, Math.min(100, pct));
}

export interface RcRemoteData {
	throttlePercent: number | null;
	aileronPercent: number | null;
	rudderPercent: number | null;
	gear: "manual" | "auto" | null;
}

export function useRcRemoteData(): RcRemoteData {
	const { rcRemote } = useBridgeData();

	return {
		throttlePercent: rcRemote ? toStickPercent(rcRemote.throttle) : null,
		aileronPercent: rcRemote ? toStickPercent(rcRemote.aileron) : null,
		rudderPercent: rcRemote ? toStickPercent(rcRemote.rudder) : null,
		gear: rcRemote?.gear ?? null,
	};
}
