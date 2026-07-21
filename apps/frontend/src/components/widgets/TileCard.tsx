import type { ReactNode } from "react";
import { ObcCard } from "@oicl/openbridge-webcomponents-react/components/card/card.js";
import { ObcIconButton } from "@oicl/openbridge-webcomponents-react/components/icon-button/icon-button.js";
import { ObiCloseGoogle } from "@oicl/openbridge-webcomponents-react/icons/icon-close-google.js";
import { IconButtonVariant } from "@oicl/openbridge-webcomponents/dist/components/icon-button/icon-button.js";
import type { WidgetId } from "./registry.js";
import styles from "./TileCard.module.css";

interface TileCardProps {
	title: string;
	widgetId: WidgetId;
	editMode: boolean;
	onRemove: (id: WidgetId) => void;
	children: ReactNode;
}

export function TileCard({ title, widgetId, editMode, onRemove, children }: TileCardProps) {
	return (
		<ObcCard className={styles.tile} data-edit-mode={editMode || undefined}>
			<span slot="title" className={styles.titleText}>
				{title}
			</span>
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
