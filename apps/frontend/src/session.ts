const SESSION_KEY = "revolt_session_id";

function createSessionId(): string {
	// crypto.randomUUID() requires a secure context (https/localhost).
	// crypto.getRandomValues() works everywhere including plain-HTTP LAN access.
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // version 4
	bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variant bits
	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
	const id = `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
	sessionStorage.setItem(SESSION_KEY, id);
	return id;
}

export function getSessionId(): string {
	return sessionStorage.getItem(SESSION_KEY) ?? createSessionId();
}
