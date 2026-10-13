import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Trava a disciplina que hoje é manual: sem any, sem console solto.
    // console.error é permitido (é o canal do logErroServidor pros logs da Vercel).
    rules: {
      "no-console": ["error", { allow: ["error"] }],
      "@typescript-eslint/no-explicit-any": "error",
      // `_` na frente = ignorado de proposito (tirar um campo com rest, argumento
      // posicional que nao se usa). Sem isto o lint acusava a propria convencao.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      // So vale com o React Compiler ligado (ele pula o componente que usa o
      // `watch()` do react-hook-form). O projeto nao usa o compilador: eram 58
      // avisos de ruido. Religar junto se o compilador entrar.
      "react-hooks/incompatible-library": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
