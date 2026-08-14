import { getSessionId } from "../session";

type FetchArgs = Parameters<typeof fetch>;

/** fetch() wrapper that attaches the X-Session-ID header; use for every API call. */
export function apiFetch(input: FetchArgs[0], init?: FetchArgs[1]): Promise<Response> {
	const headers = new Headers(init?.headers);
	headers.set("x-session-id", getSessionId());

	return fetch(input, { ...init, headers });
}
