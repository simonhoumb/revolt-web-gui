import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "VITE_");

	return {
		plugins: [react()],
		resolve: {
			alias: {
				// Use TS source directly in dev, no pre-build of shared-types needed
				"@revolt/shared-types": path.resolve(
					__dirname,
					"../../packages/shared-types/src/index.ts",
				),
			},
		},
		server: {
			port: 5173,
			host: "0.0.0.0",
			hmr: { clientPort: 5173 },
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
