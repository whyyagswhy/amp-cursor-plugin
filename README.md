# amp — Agent Plugin for the Amp External API (v0.1.0, read-only)

Wraps https://ampcode.com/api/external (base `https://ampcode.com/api/v2`) as a zero-dependency Node stdio MCP server plus one skill.

## Auth (OAuth2 client credentials)
1. In your Amp workspace create an **External API Application** (only machine-to-machine apps can be created today). You get a **client ID** and **client secret**.
2. Set plugin variables `AMP_CLIENT_ID` and `AMP_CLIENT_SECRET` (Plugins → Configure). Never commit them.
3. The server POSTs `grant_type=client_credentials` with HTTP Basic auth to `https://auth.ampcode.com/oauth2/token`
   (from the OpenAPI `securitySchemes."v2.OAuth2AppAuth".flows.clientCredentials.tokenUrl`), requesting space-separated scopes:
   `amp.api:workspace.threads.meta:view amp.api:workspace.threads.contents:view amp.api:workspace.members:view amp.api:workspace.projects:view amp.git:read amp.api:workspace.groups:view amp.api:workspace.entitlements:view`
   (override with env `AMP_SCOPES`). The access token is cached in memory until `expires_in` − 60 s; a 401 from the API triggers one refresh + retry.
4. Custom workspace domain: set `AMP_API_BASE_URL=https://your-workspace.ampcode.app/api/v2`.

Without `amp.api:workspace.threads.contents:view`, thread `title`, `repositories`, `labels` are omitted and messages return 403.

Equivalent manual exchange:
```sh
curl -X POST https://auth.ampcode.com/oauth2/token -u "$AMP_CLIENT_ID:$AMP_CLIENT_SECRET" \
  -d grant_type=client_credentials -d scope="amp.api:workspace.threads.meta:view"
```

## Tools (all GET, readOnlyHint)
list_threads, get_thread_messages, get_thread_usage, list_members, list_projects, search_repo_commits, search_repo_content, search_repo_paths, get_repo_contents (base64 → UTF-8 text unless binary), repo_diff, list_groups, list_entitlements.

## Testing
```sh
node test/mock.mjs test/openapi.json &   # mock token endpoint + schema-derived example payloads on :8787
AMP_API_BASE_URL=http://127.0.0.1:8787/api/v2 AMP_TOKEN_URL=http://127.0.0.1:8787/oauth2/token \
AMP_CLIENT_ID=test-id AMP_CLIENT_SECRET=test-secret node test/client.mjs '[["list_threads",{"limit":3}]]'
```
`AMP_TOKEN_URL` is a test/override knob only, not a plugin variable.

## Notes
- Cursor docs state Cursor does not expand `${PLUGIN_ROOT}` in mcp.json; this manifest follows the Agent Plugins standard. If loading in Cursor fails, switch args to `./server/index.mjs` and drop `cwd`.
- `variables` lives under `extensions."com.cursor"` because the Agent Plugins 1.0.0 manifest schema is closed (`additionalProperties: false`).
