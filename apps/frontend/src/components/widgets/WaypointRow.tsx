import { useCallback, useEffect, useRef, useState } from "react";
import type { Waypoint } from "@revolt/shared-types";
import { ObcNumberInputField } from "@oicl/openbridge-webcomponents-react/components/number-input-field/number-input-field.js";
import {
	ObcNumberInputField as ObcNumberInputFieldElement,
	ObcNumberInputFieldSize,
} from "@oicl/openbridge-webcomponents/dist/components/number-input-field/number-input-field.js";
import { ObcIconButton } from "@oicl/openbridge-webcomponents-react/components/icon-button/icon-button.js";
import { IconButtonVariant } from "@oicl/openbridge-webcomponents/dist/components/icon-button/icon-button.js";
import { ObiArrowUpGoogle } from "@oicl/openbridge-webcomponents-react/icons/icon-arrow-up-google.js";
import { ObiArrowDownGoogle } from "@oicl/openbridge-webcomponents-react/icons/icon-arrow-down-google.js";
import { ObiWaypointDeleteIec } from "@oicl/openbridge-webcomponents-react/icons/icon-waypoint-delete-iec.js";
import { inputValue } from "../../lib/dom.js";
import { formatLatLon } from "../../lib/format.js";
import styles from "./MissionWidget.module.css";

export interface WaypointRowProps {
	waypoint: Waypoint;
	index: number;
	total: number;
	onMoveUp: () => void;
	onMoveDown: () => void;
	onDelete: () => void;
	onSpeedCommit: (knots: number) => void;
}

export function WaypointRow({
	waypoint,
	index,
	total,
	onMoveUp,
	onMoveDown,
	onDelete,
	onSpeedCommit,
}: WaypointRowProps) {
	const [speedDraft, setSpeedDraft] = useState(String(waypoint.target_speed));
	const speedInputRef = useRef<ObcNumberInputFieldElement | null>(null);

	useEffect(() => {
		setSpeedDraft(String(waypoint.target_speed));
	}, [waypoint.target_speed]);

	const commitSpeed = useCallback(() => {
		const parsed = Number.parseFloat(speedDraft);
		if (Number.isFinite(parsed) && parsed >= 0 && parsed !== waypoint.target_speed) {
			onSpeedCommit(parsed);
		} else {
			setSpeedDraft(String(waypoint.target_speed));
		}
	}, [speedDraft, waypoint.target_speed, onSpeedCommit]);

	// ObcNumberInputField's onBlur *prop* is unreliable here: the underlying Lit element defines
	// its own private onBlur() method, and @lit/react's createComponent only special-cases props
	// listed in its `events` map (just onInput for this component) -- anything else, including
	// onBlur, falls through to a plain `node.onBlur = value` property assignment. That silently
	// clobbers the Lit element's own onBlur method, and because the assignment happens on React's
	// next commit (one tick behind Lit's own re-render triggered by typing), the listener Lit
	// actually binds always reflects the *previous* keystroke's closure -- exactly the "one digit
	// behind" bug reported. `blur` itself doesn't bubble out of the shadow root, but `focusout`
	// does (it's composed), so attaching it directly via a ref sidesteps the wrapper entirely.
	useEffect(() => {
		const el = speedInputRef.current;
		if (!el) return;
		el.addEventListener("focusout", commitSpeed);
		return () => {
			el.removeEventListener("focusout", commitSpeed);
		};
	}, [commitSpeed]);

	return (
		<div className={styles.waypointRow}>
			<div className={styles.waypointMeta}>
				<span className={styles.sequenceBadge}>{index + 1}</span>
				<span className={styles.coords}>
					{formatLatLon(waypoint.position.latitude, waypoint.position.longitude)}
				</span>
			</div>
			<ObcNumberInputField
				ref={speedInputRef}
				size={ObcNumberInputFieldSize.Regular}
				unit="kt"
				value={speedDraft}
				onInput={(e) => {
					setSpeedDraft(inputValue(e));
				}}
			/>
			<div className={styles.waypointActions}>
				<ObcIconButton
					variant={IconButtonVariant.flat}
					aria-label="Move waypoint up"
					disabled={index === 0}
					onClick={onMoveUp}
				>
					<ObiArrowUpGoogle />
				</ObcIconButton>
				<ObcIconButton
					variant={IconButtonVariant.flat}
					aria-label="Move waypoint down"
					disabled={index === total - 1}
					onClick={onMoveDown}
				>
					<ObiArrowDownGoogle />
				</ObcIconButton>
				<ObcIconButton
					variant={IconButtonVariant.flat}
					aria-label="Delete waypoint"
					onClick={onDelete}
				>
					<ObiWaypointDeleteIec />
				</ObcIconButton>
			</div>
		</div>
	);
}
