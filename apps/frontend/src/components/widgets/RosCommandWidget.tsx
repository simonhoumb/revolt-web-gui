import { useEffect, useMemo, useRef, useState } from "react";
import type { RosCommandMeta, RosCommandResult } from "@revolt/shared-types";
import { ObcTextInputField } from "@oicl/openbridge-webcomponents-react/components/text-input-field/text-input-field.js";
import { ObcContextMenuInput } from "@oicl/openbridge-webcomponents-react/components/context-menu-input/context-menu-input.js";
import { ContextMenuType } from "@oicl/openbridge-webcomponents/dist/components/context-menu-input/context-menu-input.js";
import { ObcDropdownButton } from "@oicl/openbridge-webcomponents-react/components/dropdown-button/dropdown-button.js";
import { ObcIconButton } from "@oicl/openbridge-webcomponents-react/components/icon-button/icon-button.js";
import { IconButtonVariant } from "@oicl/openbridge-webcomponents/dist/components/icon-button/icon-button.js";
import { ObcProgressButton } from "@oicl/openbridge-webcomponents-react/components/progress-button/progress-button.js";
import {
	ProgressButtonType,
	ProgressMode,
} from "@oicl/openbridge-webcomponents/dist/components/progress-button/progress-button.js";
import { ObiCloseGoogle } from "@oicl/openbridge-webcomponents-react/icons/icon-close-google.js";
import { ObiMediaPlay } from "@oicl/openbridge-webcomponents-react/icons/icon-media-play.js";
import { inputValue } from "../../lib/dom.js";
import {
	RosCommandInvalidParamsError,
	RosCommandNotFoundError,
	rosCommandApi,
} from "../../lib/rosCommandApi.js";
import styles from "./RosCommandWidget.module.css";

interface HistoryEntry {
	id: string;
	commandLabel: string;
	paramsSummary: string;
	timestampMs: number;
	status: "running" | "done";
	result: RosCommandResult | null;
	errorMessage: string | null;
}

function paramsSummaryFor(params: Record<string, string>): string {
	const entries = Object.entries(params).filter(([, value]) => value !== "");
	if (entries.length === 0) return "";
	return entries.map(([name, value]) => `${name}=${value}`).join(" ");
}

// 0 if the match is at the start of the id/label, 1 if it only appears somewhere inside --
// used to sort the best match first instead of leaving suggestions in registry order once
// several of them match. ObcContextMenuInput's items only accept a plain string label (no rich/
// bold content -- see the option considered and rejected for this), so ranking is the way this
// app surfaces "which match is best" within that constraint.
export function matchRank(command: RosCommandMeta, needle: string): number {
	const startsWith =
		command.command_id.toLowerCase().startsWith(needle) ||
		command.label.toLowerCase().startsWith(needle);
	return startsWith ? 0 : 1;
}

export function RosCommandWidget() {
	const [commands, setCommands] = useState<RosCommandMeta[]>([]);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [promptValue, setPromptValue] = useState("");
	const [selectedCommand, setSelectedCommand] = useState<RosCommandMeta | null>(null);
	const [paramValues, setParamValues] = useState<Record<string, string>>({});
	const [running, setRunning] = useState(false);
	const [history, setHistory] = useState<HistoryEntry[]>([]);
	const [promptFocused, setPromptFocused] = useState(false);
	const [highlightedIndex, setHighlightedIndex] = useState(0);
	// The suggestion dropdown is an absolutely-positioned overlay anchored below the prompt row,
	// but TileCard's own body clips overflow (so tiles don't bleed into each other on the grid) --
	// left unconstrained, a small tile just hides the bottom of the list with no way to reach it.
	// Measured against the widget's own content box rather than fixed, since the tile can be
	// resized to any height via its drag handle.
	const [suggestionsMaxHeight, setSuggestionsMaxHeight] = useState(240);
	const blurTimeoutRef = useRef<number | null>(null);
	const historyRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const promptRowRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		return () => {
			if (blurTimeoutRef.current !== null) window.clearTimeout(blurTimeoutRef.current);
		};
	}, []);

	function recomputeSuggestionsMaxHeight() {
		const content = contentRef.current;
		const promptRow = promptRowRef.current;
		if (!content || !promptRow) return;
		const available =
			content.getBoundingClientRect().bottom - promptRow.getBoundingClientRect().bottom;
		// A floor keeps the list usable even in a nearly-collapsed tile, rather than shrinking to
		// a sliver; the list itself scrolls the rest of the way via overflow-y.
		setSuggestionsMaxHeight(Math.max(80, available - 8));
	}

	useEffect(() => {
		recomputeSuggestionsMaxHeight();
		const el = contentRef.current;
		if (!el) return;
		const ro = new ResizeObserver(recomputeSuggestionsMaxHeight);
		ro.observe(el);
		return () => {
			ro.disconnect();
		};
	}, []);

	// New command run, or a running entry just settled -- both append/replace at the tail of
	// history, so jumping to the bottom always surfaces the newest response.
	useEffect(() => {
		const el = historyRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
	}, [history]);

	useEffect(() => {
		let cancelled = false;
		rosCommandApi
			.list()
			.then((result) => {
				if (!cancelled) setCommands(result);
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setLoadError(err instanceof Error ? err.message : "Failed to load commands.");
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);

	// Shown on focus even with nothing typed yet, like a command palette (VS Code's Ctrl+Shift+P,
	// Slack's "/") -- with a fixed, small vocabulary there's no reason to make the operator guess
	// a starting letter before anything is suggested.
	const suggestions = useMemo(() => {
		if (selectedCommand || !promptFocused) return [];
		const needle = promptValue.trim().toLowerCase();
		const matches = commands.filter(
			(c) =>
				c.command_id.toLowerCase().includes(needle) ||
				c.label.toLowerCase().includes(needle),
		);
		if (needle === "") return matches;
		return [...matches].sort((a, b) => matchRank(a, needle) - matchRank(b, needle));
	}, [commands, promptValue, selectedCommand, promptFocused]);

	const suggestionsKey = suggestions.map((c) => c.command_id).join(",");
	useEffect(() => {
		setHighlightedIndex(0);
	}, [suggestionsKey]);

	function handlePromptKeyDown(e: { key: string; preventDefault: () => void }) {
		if (suggestions.length === 0) return;
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setHighlightedIndex((i) => (i + 1) % suggestions.length);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setHighlightedIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
		} else if (e.key === "Enter") {
			e.preventDefault();
			const command = suggestions[highlightedIndex];
			if (command) selectCommand(command.command_id);
		}
	}

	function handlePromptFocus() {
		if (blurTimeoutRef.current !== null) {
			window.clearTimeout(blurTimeoutRef.current);
			blurTimeoutRef.current = null;
		}
		setPromptFocused(true);
		recomputeSuggestionsMaxHeight();
	}

	function handlePromptBlur() {
		// Clicking a suggestion blurs the text field before the menu's item-click event fires --
		// delay hiding so the click still lands on a suggestion that's still mounted.
		blurTimeoutRef.current = window.setTimeout(() => {
			setPromptFocused(false);
		}, 150);
	}

	function selectCommand(commandId: string) {
		const command = commands.find((c) => c.command_id === commandId);
		if (!command) return;
		setSelectedCommand(command);
		setPromptValue("");
		setPromptFocused(false);
		setParamValues({});
	}

	function clearSelection() {
		setSelectedCommand(null);
		setParamValues({});
	}

	const requiredParamsFilled = selectedCommand
		? selectedCommand.params.every((p) => !p.required || (paramValues[p.name] ?? "") !== "")
		: false;

	async function runCommand() {
		if (!selectedCommand || !requiredParamsFilled) return;
		const command = selectedCommand;
		const params = paramValues;
		const entryId = `${command.command_id}-${String(Date.now())}`;
		setHistory((prev) => [
			...prev,
			{
				id: entryId,
				commandLabel: command.label,
				paramsSummary: paramsSummaryFor(params),
				timestampMs: Date.now(),
				status: "running",
				result: null,
				errorMessage: null,
			},
		]);
		clearSelection();
		setRunning(true);
		try {
			const result = await rosCommandApi.execute(command.command_id, params);
			setHistory((prev) =>
				prev.map((entry) =>
					entry.id === entryId ? { ...entry, status: "done", result } : entry,
				),
			);
		} catch (err) {
			const message =
				err instanceof RosCommandNotFoundError ||
				err instanceof RosCommandInvalidParamsError
					? err.message
					: err instanceof Error
						? err.message
						: "Command failed.";
			setHistory((prev) =>
				prev.map((entry) =>
					entry.id === entryId
						? { ...entry, status: "done", errorMessage: message }
						: entry,
				),
			);
		} finally {
			setRunning(false);
		}
	}

	return (
		<div className={styles.content} ref={contentRef}>
			{loadError && <p className={styles.loadError}>{loadError}</p>}

			{!selectedCommand && (
				// onFocus/onBlur live on this wrapper, not the field itself: ObcTextInputField's
				// @lit/react wrapper only declares onInput/onChange/onClear/onBlur as real event
				// listeners -- onFocus isn't wired at all, so it would silently no-op there. A
				// container-level onFocus/onBlur (React's usual focusin/focusout-based "focus
				// within a subtree" mechanism) also means a click landing on the suggestion menu
				// below doesn't blur this the way it would if the listener sat only on the field.
				<div
					className={styles.promptRow}
					ref={promptRowRef}
					onFocus={handlePromptFocus}
					onBlur={handlePromptBlur}
				>
					<ObcTextInputField
						placeholder="Type a command…"
						value={promptValue}
						onInput={(e) => {
							setPromptValue(inputValue(e));
						}}
						onKeyDown={handlePromptKeyDown}
					/>
					{suggestions.length > 0 && (
						// The scroll/clip boundary lives on this plain wrapper div, not on
						// ObcContextMenuInput itself: the component's own shadow DOM already has
						// an internal .context-menu box with its own overflow-y: auto and a
						// fit-content width, independent of whatever's set on the host element --
						// styling the host directly produced a scrollbar that didn't visually
						// line up with the rendered dropdown. A normal light-DOM div has fully
						// predictable box/scroll behavior, so it does the clipping instead.
						<div
							className={styles.suggestionsScroll}
							style={{ maxHeight: suggestionsMaxHeight }}
						>
							<ObcContextMenuInput
								type={ContextMenuType.Regular}
								options={suggestions.map((c) => ({
									value: c.command_id,
									label: c.label,
								}))}
								// Reuses the component's own "selected" visual state to show which
								// suggestion arrow-key navigation currently points at, rather than
								// building a separate highlight style -- there's no meaningful
								// difference before Enter actually commits the choice.
								selectedValues={
									suggestions[highlightedIndex]
										? [suggestions[highlightedIndex].command_id]
										: []
								}
								onItemClick={(e) => {
									selectCommand(e.detail.value);
								}}
							/>
						</div>
					)}
				</div>
			)}

			{selectedCommand && (
				<div className={styles.selectedCommand}>
					<div className={styles.selectedCommandHeader}>
						<span className={styles.selectedCommandLabel}>{selectedCommand.label}</span>
						<ObcIconButton
							variant={IconButtonVariant.flat}
							aria-label="Change command"
							onClick={clearSelection}
						>
							<ObiCloseGoogle />
						</ObcIconButton>
					</div>
					<p className={styles.selectedCommandDescription}>
						{selectedCommand.description}
					</p>

					{selectedCommand.params.map((param) =>
						param.kind === "topic_select" || param.kind === "param_select" ? (
							<ObcDropdownButton
								key={param.name}
								options={(param.allowed_values ?? []).map((v) => ({
									value: v,
									label: v,
								}))}
								value={paramValues[param.name]}
								fullWidth
								onDropdownChange={(e) => {
									setParamValues((prev) => ({
										...prev,
										[param.name]: e.detail.value,
									}));
								}}
							/>
						) : (
							<ObcTextInputField
								key={param.name}
								label={param.label}
								value={paramValues[param.name] ?? ""}
								onInput={(e) => {
									const value = inputValue(e);
									setParamValues((prev) => ({ ...prev, [param.name]: value }));
								}}
							/>
						),
					)}

					<ObcProgressButton
						type={ProgressButtonType.Linear}
						mode={ProgressMode.Indeterminate}
						showProgress={running}
						hasLeadingIcon
						label="Run"
						disabled={running || !requiredParamsFilled}
						onClick={() => {
							void runCommand();
						}}
					>
						<ObiMediaPlay slot="leading-icon" />
					</ObcProgressButton>
				</div>
			)}

			<div className={styles.history} ref={historyRef}>
				{history.length === 0 && (
					<p className={styles.emptyState}>Command output will appear here.</p>
				)}
				{history.map((entry) => (
					<div
						key={entry.id}
						className={
							entry.status === "done" &&
							(entry.errorMessage !== null || entry.result?.ok === false)
								? styles.historyEntryFailed
								: styles.historyEntry
						}
					>
						<div className={styles.historyHeader}>
							<span className={styles.historyCommand}>
								{entry.commandLabel}
								{entry.paramsSummary ? ` ${entry.paramsSummary}` : ""}
							</span>
							<span className={styles.historyTimestamp}>
								{new Date(entry.timestampMs).toLocaleTimeString()}
							</span>
						</div>
						{entry.status === "running" && (
							<p className={styles.historyBody}>Running…</p>
						)}
						{entry.errorMessage && (
							<p className={styles.historyBody}>{entry.errorMessage}</p>
						)}
						{entry.result && (
							<pre className={styles.historyBody}>
								{entry.result.ok
									? JSON.stringify(entry.result.result, null, 2)
									: `Failed: ${entry.result.error ?? "unknown error"}`}
							</pre>
						)}
					</div>
				))}
			</div>
		</div>
	);
}
