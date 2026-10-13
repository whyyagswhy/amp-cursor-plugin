---
name: amp
description: Look up Amp (ampcode.com) workspace data — threads, thread messages and cost/usage, members, projects, project repository search/files/diffs, groups, entitlements — via the read-only amp MCP tools.
---

# Amp workspace (read-only)

Use the `amp` MCP tools when the user asks about their Amp workspace:

- **Threads first.** "What threads / who worked on X / threads in project Y / since date Z" → `list_threads` (filters: `query`, `project`, `after`, `before`, `order`, `creator_email`, `limit`, `cursor`). Then `get_thread_messages` for content and `get_thread_usage` for cost/tokens (usage only exists for threads < 90 days old).
- People → `list_members` (map `creatorUserID` to names/emails). Groups → `list_groups`. Credit limits → `list_entitlements`.
- Projects → `list_projects`. Code in an Amp project repo → `search_repo_paths` (glob), `search_repo_content` (regex), `search_repo_commits` (substring), `get_repo_contents` (file text or directory listing), `repo_diff`. Project is a UUID or `@namespace/name`; `ref` is required (try `main`).

Rules:
- Never invent threads, IDs, users, costs, or file contents. Only report what tools return; if a tool errors (401/403/404), say so and stop guessing.
- 401 = client credentials missing/invalid; 403 = the M2M app lacks the scope named in the error.
- Follow `nextCursor` only when the user needs more results.
- These tools are read-only; there is no way to delete or modify Amp data here.
