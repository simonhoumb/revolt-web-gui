import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
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
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
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
