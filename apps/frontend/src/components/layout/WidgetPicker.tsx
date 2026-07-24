import { useState } from "react";
import { ObcAppMenu } from "@oicl/openbridge-webcomponents-react/components/app-menu/app-menu.js";
import { ObcAppButton } from "@oicl/openbridge-webcomponents-react/components/app-button/app-button.js";
import { ObcIconButton } from "@oicl/openbridge-webcomponents-react/components/icon-button/icon-button.js";
import { ObiCloseGoogle } from "@oicl/openbridge-webcomponents-react/icons/icon-close-google.js";
import { ObiCommandLocked } from "@oicl/openbridge-webcomponents-react/icons/icon-command-locked.js";
import { ObiCommandLockedF } from "@oicl/openbridge-webcomponents-react/icons/icon-command-locked-f.js";
import { IconButtonVariant } from "@oicl/openbridge-webcomponents/dist/components/icon-button/icon-button.js";
import { useLayout } from "../../context/useLayout.js";
import { WIDGET_REGISTRY, ALL_WIDGET_IDS, type WidgetId } from "../widgets/registry.js";
import styles from "./WidgetPicker.module.css";

interface WidgetPickerProps {
	onClose: () => void;
}

export function WidgetPicker({ onClose }: WidgetPickerProps) {
	const [search, setSearch] = useState("");
	const [templateName, setTemplateName] = useState("");
	const {
		config,
		addWidget,
		removeWidget,
		templates,
		saveTemplate,
		loadTemplate,
		deleteTemplate,
		resetLayout,
		editMode,
		toggleEditMode,
	} = useLayout();

	const visibleIds = new Set(config.tiles.map((t) => t.i));

	const filteredIds = ALL_WIDGET_IDS.filter((id) => {
		if (!search) return true;
		return WIDGET_REGISTRY[id].label.toLowerCase().includes(search.toLowerCase());
	});

	function handleToggle(id: WidgetId) {
		if (visibleIds.has(id)) {
			removeWidget(id);
		} else {
			addWidget(id);
		}
	}

	function handleSaveTemplate() {
		const name = templateName.trim();
		if (!name) return;
		saveTemplate(name);
		setTemplateName("");
	}

	return (
		<div className={styles.panel}>
			<ObcAppMenu
				style={{ width: "100%" }}
				onSearch={(e) => {
					setSearch(e.detail);
				}}
			>
				{filteredIds.map((id) => {
					const def = WIDGET_REGISTRY[id];
					const Icon = def.icon;
					return (
						<ObcAppButton
							key={id}
							label={def.label}
							checked={visibleIds.has(id)}
							onClick={() => {
								handleToggle(id);
							}}
						>
							<Icon slot="icon" />
						</ObcAppButton>
					);
				})}

				<div className={styles.menuFooter}>
					<div className={styles.divider} />
					<button
						className={styles.editModeButton}
						data-active={editMode}
						onClick={() => {
							toggleEditMode();
							if (editMode) onClose();
						}}
					>
						{editMode ? <ObiCommandLocked /> : <ObiCommandLockedF />}
						<span>{editMode ? "Lock layout" : "Unlock layout"}</span>
					</button>
					<div className={styles.divider} />

					<div className={styles.templates}>
						<span className={styles.sectionTitle}>Templates</span>
						{templates.map((t) => (
							<div key={t.name} className={styles.row}>
								<button
									className={styles.templateName}
									onClick={() => {
										loadTemplate(t.name);
										onClose();
									}}
								>
									{t.name}
								</button>
								{t.savedAt > 0 && (
									<ObcIconButton
										variant={IconButtonVariant.flat}
										aria-label={`Delete template ${t.name}`}
										onClick={() => {
											deleteTemplate(t.name);
										}}
									>
										<ObiCloseGoogle />
									</ObcIconButton>
								)}
							</div>
						))}
						<div className={styles.saveRow}>
							<input
								className={styles.nameInput}
								type="text"
								placeholder="Template name…"
								value={templateName}
								onChange={(e) => {
									setTemplateName(e.target.value);
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleSaveTemplate();
								}}
							/>
							<button
								className={styles.saveButton}
								onClick={handleSaveTemplate}
								disabled={!templateName.trim()}
							>
								Save
							</button>
						</div>
					</div>

					<div className={styles.divider} />

					<button className={styles.resetButton} onClick={resetLayout}>
						Reset to default layout
					</button>
				</div>
			</ObcAppMenu>
		</div>
	);
}
