import { CameraWidget } from "../widgets/CameraWidget.js";
import styles from "./MapArea.module.css";

export function MapArea() {
	return (
		<main className={styles.area} aria-label="Map">
			<CameraWidget />
		</main>
	);
}
