import type { ReactNode } from "react";
import { ObcCard } from "@oicl/openbridge-webcomponents-react/components/card/card.js";
import { ObcIconButton } from "@oicl/openbridge-webcomponents-react/components/icon-button/icon-button.js";
import { ObiCloseGoogle } from "@oicl/openbridge-webcomponents-react/icons/icon-close-google.js";
import { ObiTable } from "@oicl/openbridge-webcomponents-react/icons/icon-table.js";
import { ObiSpeed } from "@oicl/openbridge-webcomponents-react/icons/icon-speed.js";
import { IconButtonVariant } from "@oicl/openbridge-webcomponents/dist/components/icon-button/icon-button.js";
import { WIDGET_REGISTRY, type ViewModeToggleConfig, type WidgetId } from "./registry.js";
import type { WidgetViewMode } from "./ViewModeToggle.js";
import styles from "./TileCard.module.css";
import { Tooltip } from "./Tooltip.js";

// Used by every widget with supportsViewModeToggle that doesn't supply its own
// viewModeToggle override -- this is the toggle's original detail-level meaning.
const DEFAULT_VIEW_MODE_TOGGLE: ViewModeToggleConfig = {
	detailedLabel: "detailed",
	instrumentLabel: "instrument",
	DetailedIcon: ObiTable,
	InstrumentIcon: ObiSpeed,
};

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
	const toggleConfig = WIDGET_REGISTRY[widgetId].viewModeToggle ?? DEFAULT_VIEW_MODE_TOGGLE;
	const targetLabel =
		viewMode === "instrument" ? toggleConfig.detailedLabel : toggleConfig.instrumentLabel;
	const ToggleIcon =
		viewMode === "instrument" ? toggleConfig.DetailedIcon : toggleConfig.InstrumentIcon;

	return (
		<ObcCard className={styles.tile} data-edit-mode={editMode || undefined}>
			<span slot="title" className={styles.titleText}>
				{title}
			</span>
			{viewMode !== undefined && onViewModeChange !== undefined && (
				<Tooltip label={`Switch to ${targetLabel} view`} asChild>
					<ObcIconButton
						slot="title"
						className={styles.viewModeButton}
						variant={IconButtonVariant.flat}
						aria-label={`Switch to ${targetLabel} view`}
						onClick={() => {
							onViewModeChange(viewMode === "instrument" ? "detailed" : "instrument");
						}}
					>
						<ToggleIcon />
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
