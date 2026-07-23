import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ObcTooltip } from "@oicl/openbridge-webcomponents-react/components/tooltip/tooltip.js";
import {
	TooltipType,
	TooltipVariant,
} from "@oicl/openbridge-webcomponents/dist/components/tooltip/tooltip.js";
import styles from "./Tooltip.module.css";

export { TooltipVariant };

interface TooltipProps {
	label: string;
	variant?: TooltipVariant;
	icon?: ReactNode;
	children: ReactNode;
}

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

// Thin reusable wrapper around obc-tooltip: the component itself is just the styled bubble (label,
// optional icon, a bottom arrow) with no positioning or show/hide behavior of its own -- that's
// left entirely to the consumer. This wraps whatever trigger element is passed as children, shows
// the bubble on hover/focus (via CSS, see --tooltip-show-delay/--tooltip-hide-delay in
// Tooltip.module.css for the reveal/linger delays), and picks whichever side actually fits the
// viewport instead of always rendering below/above and letting it clip off-screen near the edges
// of the window.
export function Tooltip({ label, variant = TooltipVariant.normal, icon, children }: TooltipProps) {
	const anchorRef = useRef<HTMLSpanElement>(null);
	const bubbleRef = useRef<HTMLSpanElement>(null);
	const [side, setSide] = useState<TooltipSide>("bottom");
	const [position, setPosition] = useState<CSSProperties>({});

	// Measures the trigger and the bubble's own (already-rendered, just invisible) size on
	// hover/focus start, so the side and exact position are both settled before the CSS delay
	// reveals it. Recalculated on every hover/focus (not just once on mount) in case the page
	// scrolled or the trigger moved since the last time.
	const updatePlacement = useCallback(() => {
		const anchor = anchorRef.current;
		const bubble = bubbleRef.current;
		if (!anchor || !bubble) return;
		const triggerRect = anchor.getBoundingClientRect();
		const bubbleRect = bubble.getBoundingClientRect();
		const { side: nextSide, box } = pickSide(
			triggerRect,
			{ width: bubbleRect.width, height: bubbleRect.height },
			window.innerWidth,
			window.innerHeight,
		);
		setSide(nextSide);
		setPosition({ top: box.top, left: box.left });
	}, []);

	return (
		<span
			ref={anchorRef}
			className={styles.anchor}
			onMouseEnter={updatePlacement}
			onFocus={updatePlacement}
		>
			{children}
			<span ref={bubbleRef} className={styles.bubble} data-side={side} style={position}>
				<ObcTooltip type={TooltipType.label} variant={variant} label={label} showIcon={!!icon}>
					{icon && <span slot="icon">{icon}</span>}
				</ObcTooltip>
			</span>
		</span>
	);
}
