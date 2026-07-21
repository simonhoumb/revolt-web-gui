import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// @lit/react ships a separate "node" build (via package.json "exports"
// conditions) meant for SSR only -- it has no client-side event wiring at
// all (no addEventListener calls for custom events like onValue/onUp/
// onDown). Vitest runs under Node, so bare `import "@lit/react"` resolves
// there by default even though the "jsdom" test environment simulates a
// real browser DOM. Alias straight to the browser+development build's
// absolute path so OBC's React-wrapped web components (ObcStepperBox,
// ObcToggleButtonGroup, etc.) actually attach their event listeners in
// tests. Resolved via require.resolve (not a hardcoded pnpm hash path) so
// this survives dependency updates. A global `resolve.conditions:
// ["browser"]` also "fixes" this but is too broad -- it breaks jsdom's own
// internal dependency on the Node "ws" package for its WebSocket polyfill.
// require.resolve("@lit/react") lands on whichever conditional subpath Node
// picked (e.g. ".../@lit/react/node/index.js") -- package.json itself is
// exports-restricted for third-party packages, so truncate at the package
// name boundary instead of resolving it directly.
const litReactEntry = require.resolve("@lit/react");
const litReactMarker = "@lit/react/";
const litReactDir = litReactEntry.slice(
	0,
	litReactEntry.lastIndexOf(litReactMarker) + litReactMarker.length,
);

export default defineConfig({
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./src/test/setup.ts"],
		// node_modules deps are loaded natively by Node by default (bypassing
		// Vite's resolver, so the alias below is ignored) unless inlined so
		// Vite actually transforms them.
		server: {
			deps: {
				inline: [/@lit\/react/, /@oicl\/openbridge-webcomponents/],
			},
		},
	},
	plugins: [react()],
	resolve: {
		alias: {
			"@revolt/shared-types": path.resolve(
				__dirname,
				"../../packages/shared-types/src/index.ts",
			),
			"@lit/react": path.join(litReactDir, "development/index.js"),
		},
	},
});
