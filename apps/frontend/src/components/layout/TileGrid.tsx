import { useEffect, useRef, useState } from "react";
import { GridLayout } from "react-grid-layout";
import type { Layout } from "react-grid-layout";
import { useLayout } from "../../context/useLayout.js";
import { useApps } from "../../context/useApps.js";
import { WIDGET_REGISTRY, GRID_COLS, type WidgetId } from "../widgets/registry.js";
import { TileCard } from "../widgets/TileCard.js";
import type { WidgetViewMode } from "../widgets/ViewModeToggle.js";
import { nextNeededRowsBasis, type NeededRowsBasis } from "./neededRowsBasis.js";
import styles from "./TileGrid.module.css";

const DEFAULT_VIEW_MODE: WidgetViewMode = "instrument";

const GRID_CONFIG = {
	cols: GRID_COLS,
	margin: [6, 6] as [number, number],
};

// Rows never shrink past this, however short the window gets -- past this point
// the grid container scrolls (see TileGrid.module.css) instead of squishing tiles
// into an unusable size.
const MIN_ROW_HEIGHT = 48;

// mounted only flips true from inside the ResizeObserver callback, once a real measurement has
// arrived -- not right after ro.observe() registers, which runs synchronously while the callback
// itself is always asynchronous (ResizeObserver never calls back in the same task as observe()).
// Flipping it early let GridLayout render once with an arbitrary placeholder width, computing
// column widths from that instead of the container's real size; the follow-up render with the
// correct width normally arrives within a frame, but this widget renders full-size WebGL/canvas
// content (MapWidget) that bakes its own resolution in at construction time, so that first wrong
// frame could stick in a way a plain gauge or list resizing to the same eventual width wouldn't --
// most visible across the repeated remounts a hot reload causes.
function useContainerSize() {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [width, setWidth] = useState(0);
	const [height, setHeight] = useState(0);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const ro = new ResizeObserver(([entry]) => {
			if (!entry) return;
			setWidth(Math.floor(entry.contentRect.width));
			setHeight(entry.contentRect.height);
			setMounted(true);
		});
		ro.observe(el);
		return () => {
			ro.disconnect();
		};
	}, []);

	return { containerRef, width, height, mounted };
}

export function TileGrid() {
	const { containerRef, width, height, mounted } = useContainerSize();
	const { config, updateLayout, editMode, removeWidget, layoutGeneration } = useLayout();
	const { activeAppId, appDef, isLocked } = useApps();
	// A locked app's tiles are static data, never LayoutContext.config -- routing them through
	// config/updateLayout would persist over the customizable dashboard's own saved layout the
	// moment a locked app was opened. See apps.ts for why.
	const tiles = appDef.kind === "locked" ? appDef.tiles : config.tiles;
	const effectiveEditMode = editMode && !isLocked;
	// Incremented when drag/resize produces an out-of-bounds layout; forces GridLayout
	// to remount and re-initialize from the valid propsLayout, snapping tiles back.
	const [gridKey, setGridKey] = useState(0);

	// Lives here, not inside each widget: the toggle button that controls it lives in TileCard's
	// title bar (see TileCard.tsx), which TileGrid renders as the widget's parent, so this is the
	// lowest point both TileCard and the widget component can share it from. Keyed by widget id,
	// same granularity as the local state each toggleable widget used to own itself -- a widget
	// only ever appears once across the active tiles, so there's no cross-tile collision risk.
	const [viewModes, setViewModes] = useState<Partial<Record<WidgetId, WidgetViewMode>>>({});

	// Toggles data-drag-invalid on the container to switch placeholder color via CSS.
	// Direct DOM mutation keeps the hot drag path out of React's render cycle.
	const setPlaceholderInvalid = (invalid: boolean) => {
		const el = containerRef.current;
		if (!el) return;
		if (invalid) {
			el.dataset.dragInvalid = "";
		} else {
			delete el.dataset.dragInvalid;
		}
	};

	const marginY = GRID_CONFIG.margin[1];

	// The most rows that could ever fit at MIN_ROW_HEIGHT. Caps interactive drag/resize
	// so editing a layout can't squish it below a usable size -- same role the old fixed
	// maxRows played, just computed from the floor instead of a constant rowHeight.
	const maxRows =
		height > 0 ? Math.floor((height - marginY) / (MIN_ROW_HEIGHT + marginY)) : undefined;

	// How many rows the current layout actually spans. rowHeight below is derived from
	// this and the container's height, exactly mirroring how column width is already
	// derived from containerWidth / cols -- so the whole layout always fits vertically,
	// on any window size, instead of a fixed pixel rowHeight running past the bottom.
	// See nextNeededRowsBasis's own comment for why this isn't just a live Math.max(...).
	const rawNeededRows = Math.max(1, ...tiles.map((tile) => tile.y + tile.h));
	const neededRowsBasisRef = useRef<NeededRowsBasis>({ generation: -1, rows: 1 });
	neededRowsBasisRef.current = nextNeededRowsBasis(
		neededRowsBasisRef.current,
		layoutGeneration,
		rawNeededRows,
	);
	const neededRows = neededRowsBasisRef.current.rows;

	// containerPadding defaults to margin=[8,8]; each row occupies rowHeight+marginY pixels
	// minus one marginY for the last row, plus 2*containerPaddingY total.
	const rowHeight =
		height > 0
			? Math.max(MIN_ROW_HEIGHT, (height - (neededRows + 1) * marginY) / neededRows)
			: MIN_ROW_HEIGHT;

	const layout: Layout = tiles.map((tile) => {
		const def = WIDGET_REGISTRY[tile.i];
		return {
			i: tile.i,
			x: tile.x,
			y: tile.y,
			w: tile.w,
			h: tile.h,
			minW: def.minW,
			minH: def.minH,
		};
	});

	return (
		<div ref={containerRef} className={styles.grid}>
			{mounted && (
				<GridLayout
					key={`${activeAppId}-${gridKey.toString()}`}
					width={width}
					layout={layout}
					gridConfig={{ ...GRID_CONFIG, rowHeight, maxRows }}
					dragConfig={{ enabled: effectiveEditMode, handle: "[data-drag-handle]" }}
					resizeConfig={{ enabled: effectiveEditMode }}
					onDrag={(currentLayout) => {
						setPlaceholderInvalid(
							maxRows !== undefined &&
								currentLayout.some((item) => item.y + item.h > maxRows),
						);
					}}
					onResize={(currentLayout) => {
						setPlaceholderInvalid(
							maxRows !== undefined &&
								currentLayout.some((item) => item.y + item.h > maxRows),
						);
					}}
					onDragStop={(finalLayout) => {
						setPlaceholderInvalid(false);
						if (
							maxRows !== undefined &&
							finalLayout.some((item) => item.y + item.h > maxRows)
						) {
							setGridKey((k) => k + 1);
						}
					}}
					onResizeStop={(finalLayout) => {
						setPlaceholderInvalid(false);
						if (
							maxRows !== undefined &&
							finalLayout.some((item) => item.y + item.h > maxRows)
						) {
							setGridKey((k) => k + 1);
						}
					}}
					onLayoutChange={(updated) => {
						if (isLocked) return;
						if (
							maxRows !== undefined &&
							updated.some((item) => item.y + item.h > maxRows)
						) {
							return;
						}
						updateLayout(
							updated.map((item) => ({
								i: item.i as Parameters<typeof updateLayout>[0][number]["i"],
								x: item.x,
								y: item.y,
								w: item.w,
								h: item.h,
							})),
						);
					}}
				>
					{tiles.map((tile) => {
						const def = WIDGET_REGISTRY[tile.i];
						const W = def.component;
						const viewMode = def.supportsViewModeToggle
							? (viewModes[tile.i] ?? def.defaultViewMode ?? DEFAULT_VIEW_MODE)
							: undefined;
						const handleViewModeChange = def.supportsViewModeToggle
							? (mode: WidgetViewMode) => {
									setViewModes((prev) => ({ ...prev, [tile.i]: mode }));
								}
							: undefined;
						return (
							<div key={tile.i} className={styles.tileWrapper}>
								{effectiveEditMode && (
									<div className={styles.dragHandle} data-drag-handle="" />
								)}
								<TileCard
									title={def.label}
									widgetId={tile.i}
									editMode={effectiveEditMode}
									onRemove={removeWidget}
									viewMode={viewMode}
									onViewModeChange={handleViewModeChange}
								>
									<W viewMode={viewMode} />
								</TileCard>
							</div>
						);
					})}
				</GridLayout>
			)}
		</div>
	);
}
