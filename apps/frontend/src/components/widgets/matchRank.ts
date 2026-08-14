import type { RosCommandMeta } from "@revolt/shared-types";

// 0 if the match is at the start of the id/label, 1 if it only appears somewhere inside --
// used to sort the best match first instead of leaving suggestions in registry order once
// several of them match. ObcContextMenuInput's items only accept a plain string label (no rich/
// bold content -- see the option considered and rejected for this), so ranking is the way this
// app surfaces "which match is best" within that constraint.
export function matchRank(command: RosCommandMeta, needle: string): number {
	const startsWith =
		command.command_id.toLowerCase().startsWith(needle) ||
		command.label.toLowerCase().startsWith(needle);
	return startsWith ? 0 : 1;
}
