# cursor.directory listing — Amp (community plugin)

Unofficial, community-built plugin by Yagna Vudathu. Not affiliated with or endorsed by Amp / Sourcegraph.

## Submission process (researched 2026-10-12)
- Form: https://cursor.directory/plugins/new (sign in with GitHub or Google).
- Tab **Auto (GitHub)**: paste a **public** GitHub repo root URL → *Scan repo* → review detected components → *Publish Plugin*.
  Detected paths: `.mcp.json` (root; `mcp.json` also reportedly accepted), `skills/*/SKILL.md`, `rules/*.mdc`, `agents/*.md`, `hooks/hooks.json`, `.lsp.json`.
- Tab **Manual**: name (≥2 chars), description (≥10), optional repo/homepage URLs + keywords, ≥1 component.
- No PR needed (directory source: github.com/cursor/community-plugins). An automated security scan of a fresh clone must return "safe" before the listing appears.
- Common errors: invalid URL (use repo root), repo not public, no components found, name/repo already listed, rate limit.

## Listing copy
- **Name:** Amp (unofficial)  — suggested slug/repo: `amp-cursor-plugin`
- **Short description:** Read-only access to your Amp (ampcode.com) workspace: threads, messages, cost/usage, members, projects, repo search, files, diffs, groups, entitlements.
- **Long description:**
  Ask Cursor about your team's Amp work. This plugin adds a zero-dependency MCP server and a skill that query the Amp External API v2
  with your own machine-to-machine app credentials (OAuth2 client_credentials). 12 read-only tools: list_threads, get_thread_messages,
  get_thread_usage, list_members, list_projects, search_repo_commits, search_repo_content, search_repo_paths, get_repo_contents,
  repo_diff, list_groups, list_entitlements. Nothing can be deleted or modified. Credentials stay in your local plugin config.
- **Keywords:** amp, ampcode, threads, mcp, usage, code-search
- **Components:** MCP server `amp` (`.mcp.json`), skill `skills/amp/SKILL.md`
- **Setup for users:** create an External API Application in Amp (workspace settings) → set `AMP_CLIENT_ID` and `AMP_CLIENT_SECRET`
  in Cursor plugin settings (optional `AMP_API_BASE_URL`). Grant `amp.api:workspace.threads.contents:view` to see titles/repos/labels/messages.

## Credentials
Each user supplies **their own** Amp client ID/secret via plugin variables (`${AMP_CLIENT_ID}` placeholders in `.mcp.json`).
The owner's credentials are NOT in any file and must never be committed. Verified 2026-10-12: no credential values or token patterns in this folder.

## Checklist (owner)
- [ ] Create a **public** GitHub repo (e.g. `github.com/<you>/amp-cursor-plugin`) and push the contents of this folder.
- [ ] Before pushing: re-run a secret scan; do not add `.env` files. Consider a `.gitignore` with `.env*`.
- [ ] Add a LICENSE (e.g. MIT) — not yet present.
- [ ] Root `.mcp.json` present (added, identical to `mcp.json`); `plugin.json` and `skills/amp/SKILL.md` present.
- [ ] README states "unofficial / not affiliated with Amp"; avoid Amp logos.
- [ ] Optional: `test/openapi.json` is Amp's public spec copy — keep or drop.
- [ ] Sign in at cursor.directory/plugins/new, paste repo URL, Scan, confirm MCP + skill detected, Publish.
- [ ] Wait for security scan = safe; then verify the listing.

## Needed from the owner
GitHub account/repo name, license choice, display name, and go-ahead to publish (nothing has been created or submitted).
