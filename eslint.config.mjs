import importPlugin from "eslint-plugin-import";
import prettier from "eslint-plugin-prettier";
import unusedImports from "eslint-plugin-unused-imports";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: [
      "**/dist",
      "**/out",
      "**/out-test",
      "**/node_modules",
      "**/coverage",
      "**/.vscode-test",
      "**/*.config.js",
      "**/.DS_Store",
    ],
  },
  {
    files: ["**/*.ts"],
    plugins: {
      import: importPlugin,
      prettier,
      "unused-imports": unusedImports,
      "@typescript-eslint": typescriptEslint,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      curly: "warn",
      eqeqeq: "warn",
      "no-throw-literal": "warn",
      "no-console": "warn",
      "no-unused-vars": "off",
      "unused-imports/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          selector: "import",
          format: ["camelCase", "PascalCase"],
        },
      ],
      "import/order": [
        "warn",
        {
          groups: [
            "type",
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
            "object",
            "unknown",
          ],
          "newlines-between": "always",
          pathGroupsExcludedImportTypes: ["type"],
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
        },
      ],
      "padding-line-between-statements": [
        "warn",
        {
          blankLine: "always",
          prev: "*",
          next: "return",
        },
        {
          blankLine: "always",
          prev: ["const", "let", "var"],
          next: "*",
        },
        {
          blankLine: "any",
          prev: ["const", "let", "var"],
          next: ["const", "let", "var"],
        },
      ],
      "prettier/prettier": [
        "warn",
        {
          singleQuote: true,
          arrowParens: "avoid",
          trailingComma: "none",
          bracketSpacing: true,
          endOfLine: "auto",
        },
        { usePrettierrc: false },
      ],
    },
  },
];
