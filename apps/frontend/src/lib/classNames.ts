/** Joins truthy class names with a space, skipping any that are false/null/undefined. */
export function cx(...classes: (string | false | null | undefined)[]): string {
	return classes.filter(Boolean).join(" ");
}
