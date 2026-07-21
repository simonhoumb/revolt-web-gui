import type { HazardHit } from "@revolt/shared-types";
import styles from "./HazardList.module.css";

export function HazardList({ hazards }: { hazards: HazardHit[] }) {
	return (
		<ul className={styles.hazardList}>
			{hazards.map((hazard) => (
				<li key={hazard.layer}>
					{hazard.description}
					{hazard.count > 1 ? ` (${String(hazard.count)} charted features)` : ""}
				</li>
			))}
		</ul>
	);
}
