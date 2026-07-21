import { ObcNavigationMenu } from "@oicl/openbridge-webcomponents-react/components/navigation-menu/navigation-menu.js";
import { ObcNavigationItem } from "@oicl/openbridge-webcomponents-react/components/navigation-item/navigation-item.js";
import { ObcNavigationMenuVariant } from "@oicl/openbridge-webcomponents/dist/components/navigation-menu/navigation-menu.js";
import { useApps } from "../../context/AppContext.js";
import { useLayout } from "../../context/LayoutContext.js";
import { APPS, ALL_APP_IDS, type AppId } from "../widgets/apps.js";
import styles from "./NavigationMenu.module.css";

interface NavigationMenuProps {
	onClose: () => void;
}

export function NavigationMenu({ onClose }: NavigationMenuProps) {
	const { activeAppId, setActiveApp } = useApps();
	const { editMode, setEditMode } = useLayout();

	function handleSelect(id: AppId) {
		if (id !== "custom" && editMode) setEditMode(false);
		setActiveApp(id);
		onClose();
	}

	return (
		<ObcNavigationMenu className={styles.panel} variant={ObcNavigationMenuVariant.Full}>
			{ALL_APP_IDS.map((id) => {
				const def = APPS[id];
				const Icon = def.icon;
				return (
					<ObcNavigationItem
						key={id}
						slot="main"
						label={def.label}
						checked={activeAppId === id}
						hasIcon
						onClick={() => {
							handleSelect(id);
						}}
					>
						<Icon slot="icon" />
					</ObcNavigationItem>
				);
			})}
		</ObcNavigationMenu>
	);
}
