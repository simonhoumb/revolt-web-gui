import { useEffect, useState } from "react";

const TICK_MS = 2000;

/** Re-renders the calling component every couple seconds, purely to force staleness checks
 * (age vs. a message's own timestamp_ms) to re-evaluate even when no new message has arrived. */
export function useLiveTick(): void {
	const [, setTick] = useState(0);

	useEffect(() => {
		const interval = setInterval(() => {
			setTick((t) => t + 1);
		}, TICK_MS);
		return () => {
			clearInterval(interval);
		};
	}, []);
}
