import { useState, useEffect } from "react";

/** Re-renders the calling component once a minute, aligned to the wall-clock minute boundary. */
export function useMinuteUpdate(): string {
	const [time, setTime] = useState(new Date().toISOString());

	useEffect(() => {
		let interval: ReturnType<typeof setInterval> | null = null;

		const now = new Date();
		const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

		const timeout = setTimeout(() => {
			setTime(new Date().toISOString());
			interval = setInterval(() => {
				setTime(new Date().toISOString());
			}, 60_000);
		}, msUntilNextMinute);

		return () => {
			clearTimeout(timeout);
			if (interval !== null) clearInterval(interval);
		};
	}, []);

	return time;
}
