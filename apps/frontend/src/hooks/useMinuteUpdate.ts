import { useState, useEffect } from "react";

export function useMinuteUpdate(): string {
	const [time, setTime] = useState(new Date().toISOString());

	useEffect(() => {
		function scheduleNextMinute() {
			const now = new Date();
			const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
			const timer = setTimeout(() => {
				setTime(new Date().toISOString());
				const interval = setInterval(() => {
					setTime(new Date().toISOString());
				}, 60_000);
				return () => clearInterval(interval);
			}, msUntilNextMinute);
			return () => clearTimeout(timer);
		}
		return scheduleNextMinute();
	}, []);

	return time;
}
