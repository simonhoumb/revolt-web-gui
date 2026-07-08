import {
	createContext,
	useContext,
	useState,
	useEffect,
	useCallback,
	useMemo,
	type ReactNode,
} from "react";
import { type WidgetId, ALL_WIDGET_IDS, WIDGET_REGISTRY } from "../components/widgets/registry.js";

export interface TileLayout {
	i: WidgetId;
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface LayoutConfig {
	tiles: TileLayout[];
	hiddenWidgets: WidgetId[];
}

export interface LayoutTemplate {
	name: string;
	tiles: TileLayout[];
	hiddenWidgets: WidgetId[];
	savedAt: number;
}

interface LayoutContextValue {
	config: LayoutConfig;
	updateLayout: (tiles: TileLayout[]) => void;
	addWidget: (id: WidgetId) => void;
	removeWidget: (id: WidgetId) => void;
	resetLayout: () => void;
	templates: LayoutTemplate[];
	saveTemplate: (name: string) => void;
	loadTemplate: (name: string) => void;
	deleteTemplate: (name: string) => void;
	editMode: boolean;
	toggleEditMode: () => void;
}

const LAYOUT_KEY = "revolt-dashboard-layout";
const TEMPLATES_KEY = "revolt-dashboard-templates";

const DEFAULT_TILES: TileLayout[] = [
	{ i: "battery", x: 0, y: 0, w: 3, h: 5 },
	{ i: "gnss", x: 3, y: 0, w: 3, h: 5 },
	{ i: "connection", x: 6, y: 0, w: 3, h: 4 },
	{ i: "thruster", x: 6, y: 4, w: 3, h: 7 },
	{ i: "lidar", x: 3, y: 5, w: 3, h: 5 },
	{ i: "camera", x: 0, y: 5, w: 3, h: 7 },
	{ i: "map", x: 0, y: 12, w: 6, h: 8 },
	{ i: "mission", x: 6, y: 12, w: 4, h: 8 },
];

const DEFAULT_HIDDEN: WidgetId[] = [];

const DEFAULT_CONFIG: LayoutConfig = {
	tiles: DEFAULT_TILES,
	hiddenWidgets: DEFAULT_HIDDEN,
};

const BUILTIN_TEMPLATES: LayoutTemplate[] = [
	{
		name: "Default",
		tiles: DEFAULT_TILES,
		hiddenWidgets: DEFAULT_HIDDEN,
		savedAt: 0,
	},
	{
		name: "Instruments only",
		tiles: [
			{ i: "battery", x: 0, y: 0, w: 4, h: 5 },
			{ i: "gnss", x: 4, y: 0, w: 4, h: 5 },
			{ i: "connection", x: 8, y: 0, w: 4, h: 4 },
			{ i: "thruster", x: 0, y: 5, w: 4, h: 7 },
			{ i: "lidar", x: 4, y: 5, w: 4, h: 5 },
		],
		hiddenWidgets: ["camera", "map", "mission"],
		savedAt: 0,
	},
];

function loadConfig(): LayoutConfig {
	try {
		const raw = localStorage.getItem(LAYOUT_KEY);
		if (!raw) return DEFAULT_CONFIG;
		const parsed = JSON.parse(raw) as Partial<LayoutConfig>;

		// Merge stored tiles against defaults, filtering to known widget IDs only
		const knownIds = new Set<string>(ALL_WIDGET_IDS);
		const storedTiles = Array.isArray(parsed.tiles)
			? parsed.tiles.filter((t) => knownIds.has(t.i))
			: DEFAULT_TILES;
		const storedHidden = Array.isArray(parsed.hiddenWidgets)
			? parsed.hiddenWidgets.filter((id) => knownIds.has(id))
			: DEFAULT_HIDDEN;

		// Backfill any widget IDs that appear in neither list (new widgets added after save)
		const accountedFor = new Set([...storedTiles.map((t) => t.i), ...storedHidden]);
		const missingWidgets = ALL_WIDGET_IDS.filter((id) => !accountedFor.has(id));
		const backfillTiles: TileLayout[] = missingWidgets.map((id, idx) => {
			const def = WIDGET_REGISTRY[id];
			return {
				i: id,
				x: (idx * def.defaultW) % 12,
				y: 999,
				w: def.defaultW,
				h: def.defaultH,
			};
		});

		return {
			tiles: [...storedTiles, ...backfillTiles],
			hiddenWidgets: storedHidden,
		};
	} catch {
		return DEFAULT_CONFIG;
	}
}

function saveConfig(config: LayoutConfig): void {
	try {
		localStorage.setItem(LAYOUT_KEY, JSON.stringify(config));
	} catch {
		// localStorage unavailable — silently ignore
	}
}

function loadTemplates(): LayoutTemplate[] {
	try {
		const raw = localStorage.getItem(TEMPLATES_KEY);
		if (!raw) return [];
		return JSON.parse(raw) as LayoutTemplate[];
	} catch {
		return [];
	}
}

function saveTemplates(templates: LayoutTemplate[]): void {
	try {
		localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
	} catch {
		// localStorage unavailable — silently ignore
	}
}

function nextOpenPosition(tiles: TileLayout[]): { x: number; y: number } {
	// Find the highest occupied y row, then place below it
	const maxY = tiles.reduce((max, t) => Math.max(max, t.y + t.h), 0);
	// Try to place at the left of a new row
	return { x: 0, y: maxY };
}

const LayoutContext = createContext<LayoutContextValue | null>(null);

export function LayoutProvider({ children }: { children: ReactNode }) {
	const [config, setConfig] = useState<LayoutConfig>(loadConfig);
	const [userTemplates, setUserTemplates] = useState<LayoutTemplate[]>(loadTemplates);
	const [editMode, setEditMode] = useState(false);

	useEffect(() => {
		saveConfig(config);
	}, [config]);

	useEffect(() => {
		saveTemplates(userTemplates);
	}, [userTemplates]);

	const updateLayout = useCallback((tiles: TileLayout[]) => {
		setConfig((prev) => ({ ...prev, tiles }));
	}, []);

	const addWidget = useCallback((id: WidgetId) => {
		setConfig((prev) => {
			const def = WIDGET_REGISTRY[id];
			const pos = nextOpenPosition(prev.tiles);
			const newTile: TileLayout = {
				i: id,
				x: pos.x,
				y: pos.y,
				w: def.defaultW,
				h: def.defaultH,
			};
			return {
				tiles: [...prev.tiles, newTile],
				hiddenWidgets: prev.hiddenWidgets.filter((w) => w !== id),
			};
		});
	}, []);

	const removeWidget = useCallback((id: WidgetId) => {
		setConfig((prev) => ({
			tiles: prev.tiles.filter((t) => t.i !== id),
			hiddenWidgets: [...prev.hiddenWidgets, id],
		}));
	}, []);

	const resetLayout = useCallback(() => {
		setConfig(DEFAULT_CONFIG);
	}, []);

	const saveTemplate = useCallback(
		(name: string) => {
			const template: LayoutTemplate = {
				name,
				tiles: config.tiles,
				hiddenWidgets: config.hiddenWidgets,
				savedAt: Date.now(),
			};
			setUserTemplates((prev) => {
				const withoutSameName = prev.filter((t) => t.name !== name);
				return [...withoutSameName, template];
			});
		},
		[config],
	);

	const loadTemplate = useCallback(
		(name: string) => {
			const builtin = BUILTIN_TEMPLATES.find((t) => t.name === name);
			if (builtin) {
				setConfig({ tiles: builtin.tiles, hiddenWidgets: builtin.hiddenWidgets });
				return;
			}
			const found = userTemplates.find((t) => t.name === name);
			if (found) {
				setConfig({ tiles: found.tiles, hiddenWidgets: found.hiddenWidgets });
			}
		},
		[userTemplates],
	);

	const deleteTemplate = useCallback((name: string) => {
		setUserTemplates((prev) => prev.filter((t) => t.name !== name));
	}, []);

	const toggleEditMode = useCallback(() => {
		setEditMode((m) => !m);
	}, []);

	const allTemplates = useMemo(() => [...BUILTIN_TEMPLATES, ...userTemplates], [userTemplates]);

	return (
		<LayoutContext.Provider
			value={{
				config,
				updateLayout,
				addWidget,
				removeWidget,
				resetLayout,
				templates: allTemplates,
				saveTemplate,
				loadTemplate,
				deleteTemplate,
				editMode,
				toggleEditMode,
			}}
		>
			{children}
		</LayoutContext.Provider>
	);
}

export function useLayout(): LayoutContextValue {
	const ctx = useContext(LayoutContext);
	if (!ctx) throw new Error("useLayout must be used within LayoutProvider");
	return ctx;
}
