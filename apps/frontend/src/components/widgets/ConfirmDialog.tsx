import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ObcAlertFrame } from "@oicl/openbridge-webcomponents-react/components/alert-frame/alert-frame.js";
import {
	ObcAlertFrameStatus,
	ObcAlertFrameThickness,
	ObcAlertFrameType,
} from "@oicl/openbridge-webcomponents/dist/components/alert-frame/alert-frame.js";
import { ObcModalWindow } from "@oicl/openbridge-webcomponents-react/components/modal-window/modal-window.js";
import { ObcModalWindowSize } from "@oicl/openbridge-webcomponents/dist/components/modal-window/modal-window.js";
import styles from "./ConfirmDialog.module.css";

function useEscapeToCancel(open: boolean, onCancel: () => void) {
	useEffect(() => {
		if (!open) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") onCancel();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [open, onCancel]);
}

interface ConfirmDialogProps {
	open: boolean;
	title: string;
	content?: string;
	confirmLabel: string;
	onConfirm: () => void;
	onCancel: () => void;
	children?: ReactNode;
	// Red-accented border for the high-risk Terminate action -- otherwise identical dialog/flow
	// to Start and Pause. No slide-to-confirm or other extra friction: a plain Cancel/Done modal
	// with clear copy is the same level of confirmation this app uses everywhere else.
	danger?: boolean;
}

export function ConfirmDialog({
	open,
	title,
	content,
	confirmLabel,
	onConfirm,
	onCancel,
	children,
	danger,
}: ConfirmDialogProps) {
	useEscapeToCancel(open, onCancel);
	if (!open) return null;

	const modal = (
		<ObcModalWindow
			size={ObcModalWindowSize.Small}
			onCancelClick={onCancel}
			onCloseClick={onCancel}
			onDoneClick={onConfirm}
		>
			<span slot="title">{title}</span>
			<div slot="content" className={styles.content}>
				{content && <p>{content}</p>}
				{children}
			</div>
			<span slot="done-label">{confirmLabel}</span>
		</ObcModalWindow>
	);

	return createPortal(
		<div className={styles.overlay} onClick={onCancel} role="presentation">
			<div
				className={styles.card}
				onClick={(e) => {
					e.stopPropagation();
				}}
			>
				{modal}
				{danger && (
					// obc-alert-frame's :host is `position: absolute; inset: 0` by design -- it's
					// meant to sit as a sibling overlay that frames sized content, not wrap it.
					// Nesting the modal inside it made it (and the modal within it) expand to fill
					// the nearest positioned ancestor instead of just outlining the modal. As a
					// sibling here, it resolves against .card (position: relative, sized by the
					// modal itself) and draws its border exactly around the modal's actual edges.
					<ObcAlertFrame
						className={styles.alertFrame}
						type={ObcAlertFrameType.Regular}
						thickness={ObcAlertFrameThickness.Small}
						status={ObcAlertFrameStatus.Alarm}
					/>
				)}
			</div>
		</div>,
		document.body,
	);
}
