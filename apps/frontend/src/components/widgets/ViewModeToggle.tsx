import { ObcToggleButtonGroup } from "@oicl/openbridge-webcomponents-react/components/toggle-button-group/toggle-button-group.js";
import { ObcToggleButtonOption } from "@oicl/openbridge-webcomponents-react/components/toggle-button-option/toggle-button-option.js";
import { ObcToggleButtonOptionType } from "@oicl/openbridge-webcomponents/dist/components/toggle-button-option/toggle-button-option.js";
import { ObiTable } from "@oicl/openbridge-webcomponents-react/icons/icon-table.js";
import { ObiSpeed } from "@oicl/openbridge-webcomponents-react/icons/icon-speed.js";

export type WidgetViewMode = "detailed" | "instrument";

interface ViewModeToggleProps {
	value: WidgetViewMode;
	onChange: (mode: WidgetViewMode) => void;
}

export function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
	return (
		<ObcToggleButtonGroup
			aria-label="View mode"
			value={value}
			type={ObcToggleButtonOptionType.icon}
			onValue={(e: CustomEvent<{ value: string; previousValue: string }>) => {
				onChange(e.detail.value === "instrument" ? "instrument" : "detailed");
			}}
		>
			<ObcToggleButtonOption value="detailed" aria-label="Detailed view">
				<ObiTable slot="icon" />
			</ObcToggleButtonOption>
			<ObcToggleButtonOption value="instrument" aria-label="Instrument view">
				<ObiSpeed slot="icon" />
			</ObcToggleButtonOption>
		</ObcToggleButtonGroup>
	);
}
