import {
	Children,
	cloneElement,
	isValidElement,
	useCallback,
	useEffect,
	useRef,
	useState,
	type CSSProperties,
	type ReactElement,
	type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ObcTooltip } from "@oicl/openbridge-webcomponents-react/components/tooltip/tooltip.js";
import {
	TooltipType,
	TooltipVariant,
} from "@oicl/openbridge-webcomponents/dist/components/tooltip/tooltip.js";
import { type TooltipSide, parseCssTimeMs, pickSide } from "./tooltipPlacement.js";
import styles from "./Tooltip.module.css";

export { TooltipVariant };
export type { TooltipSide };

interface TooltipProps {
	label: string;
	variant?: TooltipVariant;
	icon?: ReactNode;
	// When true, no wrapping <span> is rendered around children -- the trigger's ref and hover/focus
	// handlers attach directly to the single child element instead. Required for triggers that only
	// work as a direct DOM child of their own parent, e.g. obc-toggle-button-option inside
	// obc-toggle-button-group (see the Tooltip component comment below).
	asChild?: boolean;
	children: ReactNode;
}

const DEFAULT_SHOW_DELAY_MS = 500;
const DEFAULT_HIDE_DELAY_MS = 0;

// Calls both handlers in sequence (existing first, so a consumer's own handler still runs even
// when asChild attaches Tooltip's own listener alongside it) rather than one clobbering the other.
// Untyped on purpose: this only ever composes DOM event handlers plucked off an arbitrary cloned
// element's props bag, which React types as unknown until narrowed per-event.
function composeHandlers(existing: unknown, added: () => void): (...args: unknown[]) => void {
	return (...args) => {
		if (typeof existing === "function") (existing as (...a: unknown[]) => void)(...args);
		added();
	};
}

// Thin reusable wrapper around obc-tooltip: the component itself is just the styled bubble (label,
// optional icon, a bottom arrow) with no positioning or show/hide behavior of its own -- that's
// left entirely to the consumer. This wraps whatever trigger element is passed as children (or, in
// asChild mode, attaches directly to it -- see below), shows the bubble on hover/focus, and picks
// whichever side actually fits the viewport instead of always rendering below/above and letting it
// clip off-screen near the edges of the window.
//
// The bubble is rendered through a portal to document.body rather than as a light-DOM child of the
// trigger. react-grid-layout (which every widget tile sits inside) positions tiles via a CSS
// transform, and a transformed ancestor becomes the containing block for any position: fixed
// descendant -- without the portal, "fixed" would resolve relative to that transformed tile rather
// than the true viewport, landing the bubble wherever the tile happens to sit instead of near the
// trigger. Portaling out to the body sidesteps this for any ancestor, not just grid tiles.
//
// Because that moves the bubble out of the trigger's own DOM subtree, a CSS :hover/:focus-within
// selector can no longer reach it, so show/hide is driven from JS state instead (still reading
// --tooltip-show-delay/--tooltip-hide-delay so the override mechanism -- see parseCssTimeMs's own
// comment in tooltipPlacement.ts -- is unchanged); only the fade animation itself stays a plain CSS
// transition, toggled by a data-visible attribute.
//
// asChild exists for triggers that can only work as a direct DOM child of their own parent --
// obc-toggle-button-group finds its options via a slotted-children query scoped to direct
// `obc-toggle-button-option` children (Lit's queryAssignedElements with a selector), so wrapping an
// option in the usual <span> anchor would silently drop it out of the group entirely (no selection
// state, no click handling). asChild skips that wrapper and clones the ref/handlers directly onto
// the single child instead, so the DOM tree the parent sees is unchanged.
export function Tooltip({
	label,
	variant = TooltipVariant.normal,
	icon,
	asChild = false,
	children,
}: TooltipProps) {
	const anchorRef = useRef<HTMLElement | null>(null);
	const setAnchor = useCallback((el: HTMLElement | null) => {
		anchorRef.current = el;
	}, []);
	const bubbleRef = useRef<HTMLSpanElement>(null);
	const [side, setSide] = useState<TooltipSide>("bottom");
	const [position, setPosition] = useState<CSSProperties>({});
	const [visible, setVisible] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Measures the trigger and the bubble's own (already-rendered, just invisible) size, so the
	// side and exact position are both settled before the delay reveals it. Recalculated on every
	// hover/focus (not just once on mount) in case the page scrolled or the trigger moved since.
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

	const clearTimer = useCallback(() => {
		if (timerRef.current !== null) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	}, []);

	const scheduleShow = useCallback(() => {
		clearTimer();
		updatePlacement();
		const anchor = anchorRef.current;
		const delayMs = anchor
			? parseCssTimeMs(
					getComputedStyle(anchor).getPropertyValue("--tooltip-show-delay"),
					DEFAULT_SHOW_DELAY_MS,
				)
			: DEFAULT_SHOW_DELAY_MS;
		timerRef.current = setTimeout(() => {
			setVisible(true);
		}, delayMs);
	}, [clearTimer, updatePlacement]);

	const scheduleHide = useCallback(() => {
		clearTimer();
		const anchor = anchorRef.current;
		const delayMs = anchor
			? parseCssTimeMs(
					getComputedStyle(anchor).getPropertyValue("--tooltip-hide-delay"),
					DEFAULT_HIDE_DELAY_MS,
				)
			: DEFAULT_HIDE_DELAY_MS;
		timerRef.current = setTimeout(() => {
			setVisible(false);
		}, delayMs);
	}, [clearTimer]);

	useEffect(() => clearTimer, [clearTimer]);

	const bubble = createPortal(
		<span
			ref={bubbleRef}
			className={styles.bubble}
			data-side={side}
			data-visible={visible || undefined}
			style={position}
		>
			<ObcTooltip type={TooltipType.label} variant={variant} label={label} showIcon={!!icon}>
				{icon && <span slot="icon">{icon}</span>}
			</ObcTooltip>
		</span>,
		document.body,
	);

	if (asChild) {
		const child = Children.only(children);
		if (!isValidElement(child)) {
			throw new Error("Tooltip: asChild requires a single valid element child");
		}
		const childProps = child.props as Record<string, unknown>;
		return (
			<>
				{cloneElement(child, {
					ref: setAnchor,
					onMouseEnter: composeHandlers(childProps.onMouseEnter, scheduleShow),
					onMouseLeave: composeHandlers(childProps.onMouseLeave, scheduleHide),
					onFocus: composeHandlers(childProps.onFocus, scheduleShow),
					onBlur: composeHandlers(childProps.onBlur, scheduleHide),
				} as Partial<ReactElement>)}
				{bubble}
			</>
		);
	}

	return (
		<span
			ref={setAnchor}
			className={styles.anchor}
			onMouseEnter={scheduleShow}
			onMouseLeave={scheduleHide}
			onFocus={scheduleShow}
			onBlur={scheduleHide}
		>
			{children}
			{bubble}
		</span>
	);
}
