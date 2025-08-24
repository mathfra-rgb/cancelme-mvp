// eslint.config.mjs
import next from "eslint-config-next";

export default [
  ...next(), // base Next.js (inclut TypeScript)
  {
    rules: {
      // Passe les règles bloquantes en "off" ou "warn"
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "react-hooks/exhaustive-deps": "warn",
      "@next/next/no-img-element": "warn",
    },
  },
];