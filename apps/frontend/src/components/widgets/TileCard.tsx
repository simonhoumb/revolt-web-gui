import type { ReactNode } from "react";
import { ObcTitleContainer } from "@oicl/openbridge-webcomponents-react/components/title-container/title-container.js";
import { ObcIconButton } from "@oicl/openbridge-webcomponents-react/components/icon-button/icon-button.js";
import { ObiCloseGoogle } from "@oicl/openbridge-webcomponents-react/icons/icon-close-google.js";
import { IconButtonVariant } from "@oicl/openbridge-webcomponents/dist/components/icon-button/icon-button.js";
import { ObcTitleContainerState } from "@oicl/openbridge-webcomponents/dist/components/title-container/title-container.js";
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
		<div className={styles.tile} data-edit-mode={editMode || undefined}>
			<div className={styles.header}>
				<ObcTitleContainer
					titleValue={title}
					state={ObcTitleContainerState.Enabled}
					onActionClick={
						editMode
							? () => {
									onRemove(widgetId);
								}
							: undefined
					}
				>
					{editMode && (
						<ObcIconButton
							slot="actions"
							variant={IconButtonVariant.flat}
							aria-label="Remove widget"
						>
							<ObiCloseGoogle />
						</ObcIconButton>
					)}
				</ObcTitleContainer>
			</div>
			<div className={styles.body}>{children}</div>
		</div>
	);
}
