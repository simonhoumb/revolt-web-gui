import type { ReactNode } from "react";
import { ObcCard } from "@oicl/openbridge-webcomponents-react/components/card/card.js";
import { ObcIconButton } from "@oicl/openbridge-webcomponents-react/components/icon-button/icon-button.js";
import { ObiCloseGoogle } from "@oicl/openbridge-webcomponents-react/icons/icon-close-google.js";
import { ObiTable } from "@oicl/openbridge-webcomponents-react/icons/icon-table.js";
import { ObiSpeed } from "@oicl/openbridge-webcomponents-react/icons/icon-speed.js";
import { IconButtonVariant } from "@oicl/openbridge-webcomponents/dist/components/icon-button/icon-button.js";
import type { WidgetId } from "./registry.js";
import type { WidgetViewMode } from "./ViewModeToggle.js";
import styles from "./TileCard.module.css";
import { Tooltip } from "./Tooltip.js";

interface TileCardProps {
	title: string;
	widgetId: WidgetId;
	editMode: boolean;
	onRemove: (id: WidgetId) => void;
	// Both present together or both absent -- only widgets with an instrument/detailed toggle
	// (WIDGET_REGISTRY[id].supportsViewModeToggle) get this button at all.
	viewMode?: WidgetViewMode;
	onViewModeChange?: (mode: WidgetViewMode) => void;
	children: ReactNode;
}

export function TileCard({
	title,
	widgetId,
	editMode,
	onRemove,
	viewMode,
	onViewModeChange,
	children,
}: TileCardProps) {
	return (
		<ObcCard className={styles.tile} data-edit-mode={editMode || undefined}>
			<span slot="title" className={styles.titleText}>
				{title}
			</span>
			{viewMode !== undefined && onViewModeChange !== undefined && (
				<Tooltip
					label={
						viewMode === "instrument"
							? "Switch to detailed view"
							: "Switch to instrument view"
					}
					asChild
				>
					<ObcIconButton
						slot="title"
						className={styles.viewModeButton}
						variant={IconButtonVariant.flat}
						aria-label={
							viewMode === "instrument"
								? "Switch to detailed view"
								: "Switch to instrument view"
						}
						onClick={() => {
							onViewModeChange(viewMode === "instrument" ? "detailed" : "instrument");
						}}
					>
						{viewMode === "instrument" ? <ObiTable /> : <ObiSpeed />}
					</ObcIconButton>
				</Tooltip>
			)}
			{editMode && (
				<ObcIconButton
					slot="title"
					className={styles.removeButton}
					variant={IconButtonVariant.flat}
					aria-label="Remove widget"
					onClick={() => {
						onRemove(widgetId);
					}}
				>
					<ObiCloseGoogle />
				</ObcIconButton>
			)}
			<div className={styles.body}>{children}</div>
		</ObcCard>
	);
}
