import { useEffect, useRef, useState } from "react";
import { GridLayout } from "react-grid-layout";
import type { Layout } from "react-grid-layout";
import { useLayout } from "../../context/LayoutContext.js";
import { WIDGET_REGISTRY } from "../widgets/registry.js";
import { TileCard } from "../widgets/TileCard.js";
import styles from "./TileGrid.module.css";

const GRID_CONFIG = {
	cols: 12,
	rowHeight: 80,
	margin: [8, 8] as [number, number],
};

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
		return () => { ro.disconnect(); };
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

	// containerPadding defaults to margin=[8,8]; each row occupies rowHeight+marginY pixels
	// minus one marginY for the last row, plus 2*containerPaddingY total.
	// Simplified: maxRows = floor((contentHeight - marginY) / (rowHeight + marginY))
	const maxRows = height > 0
		? Math.floor(
			(height - GRID_CONFIG.margin[1]) /
			(GRID_CONFIG.rowHeight + GRID_CONFIG.margin[1]),
		)
		: undefined;

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
					gridConfig={{ ...GRID_CONFIG, maxRows }}
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
						if (maxRows !== undefined && finalLayout.some((item) => item.y + item.h > maxRows)) {
							setGridKey((k) => k + 1);
						}
					}}
					onResizeStop={(finalLayout) => {
						setPlaceholderInvalid(false);
						if (maxRows !== undefined && finalLayout.some((item) => item.y + item.h > maxRows)) {
							setGridKey((k) => k + 1);
						}
					}}
					onLayoutChange={(updated) => {
						if (maxRows !== undefined && updated.some((item) => item.y + item.h > maxRows)) {
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
								{editMode && <div className={styles.dragHandle} data-drag-handle="" />}
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
