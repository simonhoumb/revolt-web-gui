const SESSION_KEY = "revolt_session_id";

function createSessionId(): string {
	const id = crypto.randomUUID();
	sessionStorage.setItem(SESSION_KEY, id);
	return id;
}

export function getSessionId(): string {
	return sessionStorage.getItem(SESSION_KEY) ?? createSessionId();
}
