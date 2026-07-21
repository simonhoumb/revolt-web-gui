import { StatusIndicatorStatus } from "@oicl/openbridge-webcomponents/dist/components/status-indicator/status-indicator.js";

/**
 * Maps a domain status string to an OBC StatusIndicatorStatus via a lookup table, falling back to
 * `inactive` for any status not present in the mapping. Shared shape behind MissionWidget's
 * send-status indicator and MissionControlWidget's execution-state indicator, which map two
 * different domain enums onto the same OBC component.
 */
export function statusIndicatorFor<T extends string>(
	status: T,
	mapping: Partial<Record<T, StatusIndicatorStatus>>,
	fallback: StatusIndicatorStatus = StatusIndicatorStatus.inactive,
): StatusIndicatorStatus {
	return mapping[status] ?? fallback;
}
