Quick reference for knowledge base usage patterns:

## During Work — When to Store Knowledge
After ANY of these events, call `brain_add` immediately:
1. **You resolve a build/compile error** — category: `debugging`
2. **You discover an API quirk or gotcha** — category: `api`
3. **You establish a pattern used across multiple files** — category: `pattern`
4. **You make or encounter an architectural decision** — category: `architecture`
5. **You learn a configuration detail** — category: `config`
6. **You work around a framework limitation** — category: `debugging`

**Rule of thumb:** If you had to figure something out (it wasn't obvious from the code alone), store it.

## What Makes a Good Entry
- **Title:** Short, searchable (e.g., "DevExpress WPF: ColumnDefinition name collision")
- **Content:** Specific and actionable — include the fix, not just the problem. Include file paths when relevant.
- **Tags:** Technology names, project names, error codes, concepts
- **Project:** Set the project identifier when the knowledge is project-specific

## Categories
`pattern`, `debugging`, `api`, `config`, `architecture`, `general`
