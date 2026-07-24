/** Extracts an input change event's string value, generically over the target's exact type. */
export function inputValue(e: { target: EventTarget | null }): string {
	return (e.target as { value?: string } | null)?.value ?? "";
}
