export function inputValue(e: { target: EventTarget | null }): string {
	return (e.target as { value?: string } | null)?.value ?? "";
}
