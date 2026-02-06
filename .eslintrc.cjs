module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "import"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  env: {
    node: true,
    es2022: true
  },
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "ThrowStatement",
        message: "No throwing in this layer. Use Result<T,E>."
      }
    ],
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@nestjs/*", "typeorm", "ioredis", "pg"],
            message: "Adapters/infrastructure only. Not allowed in domain/application."
          }
        ]
      }
    ]
  },
  overrides: [
    {
      files: ["modules/**/src/domain/**/*.ts", "modules/**/src/application/**/*.ts"],
      rules: {
        "no-restricted-syntax": [
          "error",
          {
            selector: "ThrowStatement",
            message: "Domain/app must not throw."
          }
        ]
      }
    },
    {
      files: ["apps/**/src/**/*.ts", "modules/**/src/api/**/*.ts", "modules/**/src/infrastructure/**/*.ts"],
      rules: {
        "no-restricted-syntax": "off"
      }
    }
  ]
};
