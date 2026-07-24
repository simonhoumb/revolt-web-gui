import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import reactRefreshPlugin from "eslint-plugin-react-refresh";
import tsdocPlugin from "eslint-plugin-tsdoc";
import globals from "globals";

export default tseslint.config(
	// Global ignores
	{
		ignores: [
			"**/dist/**",
			"**/build/**",
			"**/node_modules/**",
			"**/*.d.ts",
			"apps/backend/**", // Python, not linted by ESLint
		],
	},

	// Base JS for all files
	js.configs.recommended,

	// TypeScript with type checking, scoped to .ts/.tsx only
	{
		files: ["**/*.{ts,tsx}"],
		extends: [
			...tseslint.configs.strictTypeChecked,
			...tseslint.configs.stylisticTypeChecked,
		],
		plugins: {
			tsdoc: tsdocPlugin,
		},
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			// warn, not error: no TSDoc comments exist yet to conflict, but this keeps a doc-comment
			// typo from blocking an unrelated PR during rollout. Promote to error once the
			// backend/frontend doc pass is done.
			"tsdoc/syntax": "warn",
		},
	},

	// TypeScript without type checking for .mjs config files
	{
		files: ["**/*.mjs"],
		extends: [...tseslint.configs.recommended],
	},

	// React rules, scoped to frontend only
	{
		files: ["apps/frontend/src/**/*.{ts,tsx}"],
		plugins: {
			react: reactPlugin,
			"react-hooks": reactHooksPlugin,
			"react-refresh": reactRefreshPlugin,
		},
		languageOptions: {
			globals: globals.browser,
		},
		settings: {
			react: { version: "detect" },
		},
		rules: {
			...reactPlugin.configs.recommended.rules,
			...reactHooksPlugin.configs.recommended.rules,
			"react/react-in-jsx-scope": "off",
			"react/prop-types": "off",
			// A file that exports both a component and something else (a hook, a plain helper
			// function, a constant) can't be safely hot-swapped by Vite's Fast Refresh in isolation
			// -- it invalidates the whole module and cascades that invalidation up through every
			// importer instead, which can land the tree in an inconsistent state (mismatched context
			// identity between a stale Provider and a freshly re-executed hook) and blank the entire
			// app until a manual reload. See ErrorBoundary.tsx and the context/useXxx.ts split for
			// the fix this caught across the whole app.
			"react-refresh/only-export-components": ["error", { allowConstantExport: true }],
		},
	},

	// Config and tooling files run in Node
	{
		files: ["*.config.{ts,mjs,js}", "**/*.config.{ts,mjs,js}"],
		languageOptions: {
			globals: globals.node,
		},
	},
);
