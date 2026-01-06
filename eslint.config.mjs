import nextConfig from "eslint-config-next";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "public/**",
      "generated/**"
    ]
  },
  ...nextConfig,
  {
    rules: {
      "@typescript-eslint/ban-types": "off",
      "react/no-unescaped-entities": "off",
      "import/no-anonymous-default-export": "off"
    }
  }
];

