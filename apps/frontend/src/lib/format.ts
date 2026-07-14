export function formatDuration(hours: number): string {
	if (!Number.isFinite(hours) || hours <= 0) return "—";
	const totalMinutes = Math.round(hours * 60);
	const h = Math.floor(totalMinutes / 60);
	const m = totalMinutes % 60;
	return h > 0 ? `${String(h)}h ${String(m)}m` : `${String(m)}m`;
}
