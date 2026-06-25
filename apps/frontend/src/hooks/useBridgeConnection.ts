import { useEffect, useRef, useState } from "react";
import type { BridgeMessage } from "@revolt/shared-types";
import { getSessionId } from "../session.js";

export interface BridgeConnectionOptions {
	onMessage?: (msg: BridgeMessage) => void;
}

export interface BridgeConnectionState {
	wsConnected: boolean;
	bridgeConnected: boolean;
	latencyMs: number | null;
}

const BACKOFF_INITIAL_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

function buildWsUrl(): string {
	const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
	const sessionId = encodeURIComponent(getSessionId());
	return `${proto}//${window.location.host}/api/ws?session_id=${sessionId}`;
}

/**
 * Manages the WebSocket connection to /api/ws for the lifetime of the component
 * that mounts it. Reconnects with exponential backoff on close or error.
 *
 * wsConnected     — the native WebSocket is open
 * bridgeConnected — backend has a live connection to rosbridge (from BridgeStatusMsg)
 * latencyMs       — end-to-end latency estimate from the last PingMsg (Date.now() - server_ms)
 *
 * onMessage callback (optional): called for every non-ping message including bridge_status.
 * Stored in a ref so callers can dispatch without causing stale closure issues.
 */
export function useBridgeConnection(
	options: BridgeConnectionOptions = {},
): BridgeConnectionState {
	const [wsConnected, setWsConnected] = useState(false);
	const [bridgeConnected, setBridgeConnected] = useState(false);
	const [latencyMs, setLatencyMs] = useState<number | null>(null);

	const wsRef = useRef<WebSocket | null>(null);
	const backoffRef = useRef(BACKOFF_INITIAL_MS);
	const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const unmountedRef = useRef(false);
	const onMessageRef = useRef(options.onMessage);
	useEffect(() => {
		onMessageRef.current = options.onMessage;
	});

	useEffect(() => {
		unmountedRef.current = false;

		function connect() {
			if (unmountedRef.current) return;

			const ws = new WebSocket(buildWsUrl());
			wsRef.current = ws;

			ws.onopen = () => {
				if (unmountedRef.current) {
					ws.close();
					return;
				}
				backoffRef.current = BACKOFF_INITIAL_MS;
				setWsConnected(true);
			};

			ws.onmessage = (event: MessageEvent) => {
				let msg: BridgeMessage;
				try {
					msg = JSON.parse(event.data as string) as BridgeMessage;
				} catch {
					return;
				}

				switch (msg.type) {
					case "bridge_status":
						setBridgeConnected(msg.connected);
						onMessageRef.current?.(msg);
						break;
					case "ping":
						// Ping fires when the queue is idle (no telemetry for 30 s).
						// server_ms is the backend's send time; delta = end-to-end pipeline latency.
						setLatencyMs(Date.now() - msg.server_ms);
						break;
					default:
						// Every telemetry message carries timestamp_ms (set at backend receive time).
						// Use it for latency so the reading stays fresh whenever data is flowing.
						setLatencyMs(Date.now() - msg.timestamp_ms);
						onMessageRef.current?.(msg);
						break;
				}
			};

			ws.onclose = () => {
				if (unmountedRef.current) return;
				setWsConnected(false);
				setBridgeConnected(false);
				scheduleReconnect();
			};

			ws.onerror = () => {
				// onerror is always followed by onclose; reconnect is scheduled there.
				setWsConnected(false);
			};
		}

		function scheduleReconnect() {
			const delay = backoffRef.current;
			backoffRef.current = Math.min(backoffRef.current * 2, BACKOFF_MAX_MS);
			reconnectTimerRef.current = setTimeout(connect, delay);
		}

		connect();

		return () => {
			unmountedRef.current = true;
			if (reconnectTimerRef.current !== null) {
				clearTimeout(reconnectTimerRef.current);
			}
			wsRef.current?.close();
		};
	}, []);

	return { wsConnected, bridgeConnected, latencyMs };
}
