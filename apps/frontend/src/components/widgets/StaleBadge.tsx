import { cx } from "../../lib/classNames.js";
import styles from "./StaleBadge.module.css";

/** Explicit "Stale" label shown alongside a dimmed last-known reading whose topic has gone quiet. */
export function StaleBadge({ corner = false }: { corner?: boolean }) {
	return <span className={cx(styles.badge, corner && styles.corner)}>Stale</span>;
}
