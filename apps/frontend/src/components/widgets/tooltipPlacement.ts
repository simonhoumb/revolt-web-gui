export type TooltipSide = "bottom" | "top" | "left" | "right";

interface Size {
	width: number;
	height: number;
}

interface Box {
	top: number;
	left: number;
	width: number;
	height: number;
}

// Gap kept between the trigger and the bubble.
const GAP = 8;

export function boxForSide(side: TooltipSide, trigger: DOMRect, bubble: Size): Box {
	const { width, height } = bubble;
	switch (side) {
		case "bottom":
			return {
				top: trigger.bottom + GAP,
				left: trigger.left + trigger.width / 2 - width / 2,
				width,
				height,
			};
		case "top":
			return {
				top: trigger.top - GAP - height,
				left: trigger.left + trigger.width / 2 - width / 2,
				width,
				height,
			};
		case "right":
			return {
				top: trigger.top + trigger.height / 2 - height / 2,
				left: trigger.right + GAP,
				width,
				height,
			};
		case "left":
			return {
				top: trigger.top + trigger.height / 2 - height / 2,
				left: trigger.left - GAP - width,
				width,
				height,
			};
	}
}

export function fitsViewport(box: Box, viewportWidth: number, viewportHeight: number): boolean {
	return (
		box.top >= 0 &&
		box.left >= 0 &&
		box.top + box.height <= viewportHeight &&
		box.left + box.width <= viewportWidth
	);
}

// Tried in this order: below the trigger by default (matches most tooltip conventions and keeps
// obc-tooltip's own downward-pointing arrow visible, see the CSS), falling back to above, then
// beside it, whichever is the first to fully clear the viewport. obc-tooltip's arrow always points
// down out of its own bottom edge -- only correct on "top" (bubble above, arrow pointing down at
// the trigger below it); the CSS clips the arrow away entirely on the other three sides instead of
// showing it pointing the wrong way.
const SIDE_PREFERENCE: TooltipSide[] = ["bottom", "top", "right", "left"];

export function pickSide(
	trigger: DOMRect,
	bubble: Size,
	viewportWidth: number,
	viewportHeight: number,
): { side: TooltipSide; box: Box } {
	for (const side of SIDE_PREFERENCE) {
		const box = boxForSide(side, trigger, bubble);
		if (fitsViewport(box, viewportWidth, viewportHeight)) return { side, box };
	}
	// Nothing fits cleanly (viewport smaller than the bubble itself) -- fall back to the default
	// rather than picking a side at random.
	return { side: "bottom", box: boxForSide("bottom", trigger, bubble) };
}

// --tooltip-show-delay/--tooltip-hide-delay are CSS time values ("500ms", "1.5s"); read via
// getComputedStyle(anchor) in Tooltip.tsx so a consumer can still override them per-instance by
// setting the variable somewhere above the <Tooltip> usage in the DOM (custom properties only
// inherit downward, so it must be an ancestor of Tooltip's own wrapper span -- setting it directly
// on the trigger element passed as children won't reach the wrapper, since the trigger is a
// sibling of the wrapper's other child, not its ancestor).
export function parseCssTimeMs(value: string, fallbackMs: number): number {
	const match = /^(-?[\d.]+)(ms|s)$/.exec(value.trim());
	if (!match) return fallbackMs;
	const amount = Number(match[1]);
	if (Number.isNaN(amount)) return fallbackMs;
	return match[2] === "s" ? amount * 1000 : amount;
}
