import { ObcBrillianceMenu } from "@oicl/openbridge-webcomponents-react/components/brilliance-menu/brilliance-menu.js";
import {
	ObcBrillianceMenuVariant,
	type ObcPalette,
	type ObcPaletteChangeEvent,
	type ObcBrightnessChangeEvent,
} from "@oicl/openbridge-webcomponents/dist/components/brilliance-menu/brilliance-menu.js";
import { useChartSettings } from "../../context/useChartSettings.js";
import styles from "./BrillianceMenu.module.css";

/**
 * The navbar's brilliance panel: a single obc-brilliance-menu controlling both the chart's S-52
 * palette and the app-wide data-obc-theme chrome (kept in sync by TopNav, since ChartPalette's
 * values are chosen to match ObcPalette's exactly). Positioned as a fixed top-right panel, the same
 * pattern AlertMenu uses, rather than anchored directly under the dimming button: unlike the system
 * button, the dimming button is rendered internally by ObcTopBar with no exposed DOM anchor point.
 */
export function BrillianceMenu() {
	const { palette, setPalette, brightness, setBrightness } = useChartSettings();

	return (
		<ObcBrillianceMenu
			className={styles.panel}
			palette={palette as ObcPalette}
			brightness={brightness}
			showPalette
			showBrightness
			showNightPalette
			showDuskPalette
			showDayPalette
			showBrightPalette
			variant={ObcBrillianceMenuVariant.normal}
			onPaletteChanged={(e: ObcPaletteChangeEvent) => {
				setPalette(e.detail.value);
			}}
			onBrightnessChanged={(e: ObcBrightnessChangeEvent) => {
				setBrightness(e.detail.value);
			}}
		/>
	);
}
