import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import tseslint from 'typescript-eslint';

export default defineConfig([
	{
		files: ["**/*.{js,ts}"],
		plugins: {
			js,
		},
		extends: [js.configs.recommended, tseslint.configs.recommended],
		rules: {
			"no-unused-vars": "warn",
			"no-undef": "warn",
		},
	},
]);