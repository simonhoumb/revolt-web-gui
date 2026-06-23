import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./src/test/setup.ts"],
	},
	plugins: [react()],
	resolve: {
		alias: {
			"@revolt/shared-types": path.resolve(
				__dirname,
				"../../packages/shared-types/src/index.ts",
			),
		},
	},
});
