import { useEffect, useRef, useState } from "react";
import { GridLayout } from "react-grid-layout";
import type { Layout } from "react-grid-layout";
import { useLayout } from "../../context/LayoutContext.js";
import { WIDGET_REGISTRY } from "../widgets/registry.js";
import { TileCard } from "../widgets/TileCard.js";
import styles from "./TileGrid.module.css";

const GRID_CONFIG = {
	cols: 12,
	margin: [8, 8] as [number, number],
};

// Rows never shrink past this, however short the window gets -- past this point
// the grid container scrolls (see TileGrid.module.css) instead of squishing tiles
// into an unusable size.
const MIN_ROW_HEIGHT = 48;

function useContainerSize(initialWidth: number) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [width, setWidth] = useState(initialWidth);
	const [height, setHeight] = useState(0);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const ro = new ResizeObserver(([entry]) => {
			if (!entry) return;
			setWidth(Math.floor(entry.contentRect.width));
			setHeight(entry.contentRect.height);
		});
		ro.observe(el);
		setMounted(true);
		return () => {
			ro.disconnect();
		};
	}, []);

	return { containerRef, width, height, mounted };
}

export function TileGrid() {
	const { containerRef, width, height, mounted } = useContainerSize(1280);
	const { config, updateLayout, editMode, removeWidget } = useLayout();
	// Incremented when drag/resize produces an out-of-bounds layout; forces GridLayout
	// to remount and re-initialize from the valid propsLayout, snapping tiles back.
	const [gridKey, setGridKey] = useState(0);

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
	const neededRows = Math.max(1, ...config.tiles.map((tile) => tile.y + tile.h));

	// containerPadding defaults to margin=[8,8]; each row occupies rowHeight+marginY pixels
	// minus one marginY for the last row, plus 2*containerPaddingY total.
	const rowHeight =
		height > 0
			? Math.max(MIN_ROW_HEIGHT, (height - (neededRows + 1) * marginY) / neededRows)
			: MIN_ROW_HEIGHT;

	const layout: Layout = config.tiles.map((tile) => {
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
					key={gridKey}
					width={width}
					layout={layout}
					gridConfig={{ ...GRID_CONFIG, rowHeight, maxRows }}
					dragConfig={{ enabled: editMode, handle: "[data-drag-handle]" }}
					resizeConfig={{ enabled: editMode }}
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
					{config.tiles.map((tile) => {
						const def = WIDGET_REGISTRY[tile.i];
						const W = def.component;
						return (
							<div key={tile.i} className={styles.tileWrapper}>
								{editMode && (
									<div className={styles.dragHandle} data-drag-handle="" />
								)}
								<TileCard
									title={def.label}
									widgetId={tile.i}
									editMode={editMode}
									onRemove={removeWidget}
								>
									<W />
								</TileCard>
							</div>
						);
					})}
				</GridLayout>
			)}
		</div>
	);
}
