import styles from "./MapArea.module.css";

export function MapArea() {
	return (
		<main className={styles.area} aria-label="Map">
			<p className={styles.placeholder}>Map view will appear here</p>
		</main>
	);
}
