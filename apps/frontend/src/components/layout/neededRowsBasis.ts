export interface NeededRowsBasis {
	generation: number;
	rows: number;
}

// Deliberately not just Math.max(...) over the live config.tiles every render: a tile's pixel
// height is h * rowHeight, and rowHeight is itself derived from neededRows -- so shrinking
// whichever tile currently reaches deepest would shrink neededRows, which grows rowHeight, which
// grows that same tile's own rendered height right back, largely canceling the resize the
// operator just made (confirmed against a real drag: this is why height resizing felt "locked"
// while width, computed independent of any tile's depth, worked fine). Extracted as a pure
// function since TileGrid's own rowHeight is masked to MIN_ROW_HEIGHT in tests (the ResizeObserver
// stub in test/setup.ts never delivers a nonzero height), so this is tested directly instead.
export function nextNeededRowsBasis(
	current: NeededRowsBasis,
	generation: number,
	rawNeededRows: number,
): NeededRowsBasis {
	// A new generation (add/remove/reset/load template -- see LayoutContext's layoutGeneration)
	// always re-fits to the live value; within the same generation, the basis only grows, so
	// shrinking a tile via ordinary drag/resize always visibly shrinks it.
	if (current.generation !== generation || rawNeededRows > current.rows) {
		return { generation, rows: rawNeededRows };
	}
	return current;
}
