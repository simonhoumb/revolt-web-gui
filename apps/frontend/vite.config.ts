import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "VITE_");

	return {
		plugins: [react()],
		define: {
			// react-draggable references process.env.DRAGGABLE_DEBUG in its log()
			// helper. process is not available in the browser; replacing with false
			// makes the log calls dead code. optimizeDeps.include ensures esbuild
			// pre-bundles react-draggable and applies this replacement.
			"process.env.DRAGGABLE_DEBUG": "false",
		},
		optimizeDeps: {
			include: ["react-grid-layout"],
			esbuildOptions: {
				// react-draggable (bundled inside react-grid-layout) calls process.env.DRAGGABLE_DEBUG
				// in its log() helper. process is not available in the browser; replacing with false
				// makes the log() calls dead code so handleDragStart() can proceed to addEvent().
				define: { "process.env.DRAGGABLE_DEBUG": "false" },
			},
		},
		resolve: {
			alias: {
				// Use TS source directly in dev, no pre-build of shared-types needed
				"@revolt/shared-types": path.resolve(
					__dirname,
					"../../packages/shared-types/src/index.ts",
				),
				// pnpm's virtual store can't be reached by Vite's CSS @import resolver
				// for files listed in a package's exports field; pin to the real path.
				"react-grid-layout/css/styles.css": path.resolve(
					__dirname,
					"node_modules/react-grid-layout/css/styles.css",
				),
			},
		},
		server: {
			port: 5173,
			host: "0.0.0.0",
			hmr: { host: "localhost", port: 5173 },
			proxy: {
				"/api": {
					target: env.VITE_API_BASE_URL ?? "http://localhost:8000",
					changeOrigin: true,
					ws: true,
				},
			},
		},
		preview: {
			port: 4173,
			host: "0.0.0.0",
		},
	};
});
