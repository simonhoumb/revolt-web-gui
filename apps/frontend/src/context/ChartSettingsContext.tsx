import { useState, useEffect, type ReactNode } from "react";
import type { ChartPalette } from "../lib/s52Colors.js";
import type { SymbolStyle } from "../lib/chartStyle.js";
import { ChartSettingsContext } from "./useChartSettings.js";

/** Chart display preferences: S-52 palette, buoy/beacon/light symbol style, and the mariner's
 * safety-contour depth, persisted to localStorage. */
export interface ChartSettingsContextValue {
	palette: ChartPalette;
	setPalette: (palette: ChartPalette) => void;
	symbolStyle: SymbolStyle;
	setSymbolStyle: (style: SymbolStyle) => void;
	safetyContourM: number;
	setSafetyContourM: (meters: number) => void;
	/** 0-100; drives the brilliance panel's brightness slider and the app-wide dimming filter. */
	brightness: number;
	setBrightness: (value: number) => void;
}

interface StoredChartSettings {
	palette: ChartPalette;
	symbolStyle: SymbolStyle;
	safetyContourM: number;
	brightness: number;
}

const CHART_SETTINGS_KEY = "revolt-chart-settings";

// Matches today's index.html data-obc-theme default so the first paint (before this provider's
// effect can run) and this context's own default agree.
const DEFAULT_PALETTE: ChartPalette = "dusk";
// This vessel's small draft made a mariner-configurable margin unnecessary for the original Phase 1
// hazard check (see useWaypointMarkers.ts's history); 3m is kept as the default here for continuity,
// and is confirmed to be an actual digitized contour (VALDCO) in the Oslo Fjord ENC delivery, so the
// safety-contour line highlight has something real to show out of the box.
const DEFAULT_SAFETY_CONTOUR_M = 3;
const DEFAULT_SYMBOL_STYLE: SymbolStyle = "simplified";
const DEFAULT_BRIGHTNESS = 50;

const VALID_PALETTES: readonly ChartPalette[] = ["night", "dusk", "day", "bright"];

function isChartPalette(value: unknown): value is ChartPalette {
	return typeof value === "string" && (VALID_PALETTES as readonly string[]).includes(value);
}

function isSymbolStyle(value: unknown): value is SymbolStyle {
	return value === "simplified" || value === "traditional";
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

// Backfills each field independently rather than discarding the whole stored object if one field is
// malformed (e.g. an older/newer schema, or a hand-edited localStorage value), matching
// LayoutContext.tsx's loadConfig()'s posture.
function loadChartSettings(): StoredChartSettings {
	const defaults: StoredChartSettings = {
		palette: DEFAULT_PALETTE,
		symbolStyle: DEFAULT_SYMBOL_STYLE,
		safetyContourM: DEFAULT_SAFETY_CONTOUR_M,
		brightness: DEFAULT_BRIGHTNESS,
	};
	try {
		const raw = localStorage.getItem(CHART_SETTINGS_KEY);
		if (!raw) return defaults;
		const parsed = JSON.parse(raw) as Partial<StoredChartSettings>;
		return {
			palette: isChartPalette(parsed.palette) ? parsed.palette : defaults.palette,
			symbolStyle: isSymbolStyle(parsed.symbolStyle)
				? parsed.symbolStyle
				: defaults.symbolStyle,
			safetyContourM:
				isFiniteNumber(parsed.safetyContourM) && parsed.safetyContourM > 0
					? parsed.safetyContourM
					: defaults.safetyContourM,
			brightness:
				isFiniteNumber(parsed.brightness) &&
				parsed.brightness >= 0 &&
				parsed.brightness <= 100
					? parsed.brightness
					: defaults.brightness,
		};
	} catch {
		return defaults;
	}
}

function saveChartSettings(settings: StoredChartSettings): void {
	try {
		localStorage.setItem(CHART_SETTINGS_KEY, JSON.stringify(settings));
	} catch {
		// localStorage unavailable, silently ignore
	}
}

/** Owns chart palette/symbol-style/safety-contour/brightness, persisted to localStorage. */
export function ChartSettingsProvider({ children }: { children: ReactNode }) {
	const [settings, setSettings] = useState<StoredChartSettings>(loadChartSettings);

	useEffect(() => {
		saveChartSettings(settings);
	}, [settings]);

	return (
		<ChartSettingsContext.Provider
			value={{
				palette: settings.palette,
				setPalette: (palette) => {
					setSettings((prev) => ({ ...prev, palette }));
				},
				symbolStyle: settings.symbolStyle,
				setSymbolStyle: (symbolStyle) => {
					setSettings((prev) => ({ ...prev, symbolStyle }));
				},
				safetyContourM: settings.safetyContourM,
				setSafetyContourM: (safetyContourM) => {
					setSettings((prev) => ({ ...prev, safetyContourM }));
				},
				brightness: settings.brightness,
				setBrightness: (brightness) => {
					setSettings((prev) => ({ ...prev, brightness }));
				},
			}}
		>
			{children}
		</ChartSettingsContext.Provider>
	);
}
