import styles from "./MapPlaceholder.module.css";

export function MapPlaceholder() {
	return (
		<div className={styles.placeholder}>
			<span className={styles.label}>Map</span>
			<span className={styles.note}>Available in a future update</span>
		</div>
	);
}
