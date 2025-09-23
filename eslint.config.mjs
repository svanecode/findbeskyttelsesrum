import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [{
  ignores: [
    "node_modules/**",
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/**",
    "generated/**"
  ]
}, ...compat.extends("next/core-web-vitals"), {
  rules: {
    "@typescript-eslint/ban-types": "off",
    "react/no-unescaped-entities": "off",
    "import/no-anonymous-default-export": "off"
  }
}];

export default eslintConfig;
