---
inclusion: always
---

# Coding conventions

- JavaScript (ES modules) with JSDoc types on exported functions. No TypeScript for now.
- Prettier formatting (`.prettierrc.json`), ESLint (`eslint.config.js`). Run `npm run format` and `npm run lint`.
- Names: `camelCase` variables/functions, `PascalCase` React components and classes, `snake_case` SQL.
- Files: `kebab-case` is not used; use `camelCase.js` for modules, `PascalCase.jsx` for components.
- Small functions with one job. Prefer pure functions that take data and return data.
- Comments explain _why_, not _what_. Every non-obvious algorithmic choice gets a short reason.
- Avoid new dependencies. Before adding one, check that Node's standard library or an existing dependency cannot do it.
- No `console.log` of request bodies, tokens, documents or AI output. Log ids and status only.
- Commits: small, imperative, one concern each (`Add haversine distance`, not `stuff`). Never commit secrets.
- Update docs (`docs/`, spec task status) in the same change as the code.
