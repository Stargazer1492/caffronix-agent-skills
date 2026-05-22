---
name: ai-job-analyze
description: Collect AI job postings from public recruiting sites using the browser capabilities available to the current agent, analyze campus or experienced-hire opportunities, and generate local-first insight artifacts. Prefer Playwright or the Codex App built-in Browser, then fall back as needed to browser-use, Computer Use, or the Chrome plugin to browse public pages and extract visible page data. Use when the user asks to collect AI jobs, compare campus and experienced-hire channels, or generate job-market analysis from public recruiting pages.
---

# AI Job Analysis

This skill supports local-first AI job-market analysis. Its core purpose is to guide the current agent in choosing the right browser operation path, visiting public recruiting pages, extracting visible job-list and detail-page content, then normalizing fields, organizing insights, and saving local artifacts.

## Capability Routing

Before collecting data, first check the tools, plugins, and skills available in the current host, then choose a path in the order below. Do not choose a path based only on the operating system; routing must be based on the capabilities actually available in the current session.

1. When Playwright is available, prefer Playwright for visiting public recruiting pages. It is suitable for reproducible collection from list and detail pages, independent tabs, limited concurrency, screenshots, and structured text extraction.
2. When the Codex App built-in Browser is available, use it to open public recruiting pages, search keywords, paginate, and read job information from the page or DOM. It is the official Codex App browser capability, but whether it is exposed in the current session depends on the actual tools, plugins, and skills available.
3. When neither Playwright nor the built-in Browser is available but `browser-use` is available, use the default `browser-use` browser to visit public pages. This is an independently runnable browser automation path, but it should be treated as a fallback. Do not connect to the user's real Chrome profile unless the user explicitly asks for it.
4. Use Computer Use for clicking, typing, scrolling, and screenshot-based recognition only when the page can be operated only through a real visible UI and Computer Use is available. Computer Use depends on a single visible UI state and is not suitable as a concurrent collection path.
5. Use the Chrome plugin only as the final browser fallback when Computer Use is unavailable or when the user explicitly asks to use a real Chrome environment. By default, do not use the user's real Chrome profile, cookies, logged-in state, or local browser data to expand the collection scope.
6. If any browser tool returns a host security-policy rejection, such as `Browser Use rejected this action due to browser security policy`, `The user has requested that ... should not be used`, or a prohibition against achieving the same result through a workaround, CDP, an alternate browser surface, or indirect execution, stop that source immediately. Do not try other browsers, Computer Use, command-line HTTP requests, or other automation paths to access the same domain.
7. If all browser paths are unavailable or fail, generate only a failure summary and reasons. Do not fabricate job data.

Whichever browser path is used, final artifacts must follow `references/output-contract.md` and write the same set of files: `crawl_plan.json`, `crawl_result.json`, `jobs_index.jsonl`, `failures.jsonl`, `details/`, `normalized_jobs.jsonl`, and report files.

## Workflow

1. Before collecting data, first gather the user's intent. If the user does not provide it, use the following default scope:
   - Companies: `bytedance`, `alibaba`, `tencent`, `meituan`
   - Channels: campus recruiting, experienced-hire recruiting, or both
   - Search terms: for example `AI product manager`, `agent`, `large-model application`, `algorithm`
   - Analysis questions: the concrete questions the insights should prioritize answering

2. If the user gives only a cross-company analysis request without specifying companies, channels, or sources, first break down the task according to `references/stage1-collection.md`, generate the collection plan for this run, and control each collection batch size. Avoid packing multiple companies, multiple channels, and a large number of detail pages into one long task.

3. Execute in stages. Do not pack collection, field normalization, and insight organization into one long task:
   - Collection stage: use browser capabilities according to "Capability Routing", and follow `references/stage1-collection.md` to search, paginate, open detail pages, take screenshots, extract body text, and save local artifacts.
   - Normalization stage: have Codex App read the collection artifacts and normalize fields in batches according to `references/stage2-normalization.md`.
   - Analysis and reporting stage: have Codex App generate `report.json` and the report from normalized jobs and the user's questions according to `references/stage3-analyze-and-report.md`.

## Runtime Rules

- Runtime artifacts may be written only to `caffronix-agent-skills/ai-job-analyze/` under the writable working directory provided by the host. Do not write to the skill installation directory, the user's home directory, or any arbitrary path whose writability has not been verified.
- Do not read `.env`, cookies, local storage, browser profiles, tokens, passwords, or verification codes.
- If a recruiting site shows a login, CAPTCHA, account risk check, or permission popup, stop operating and report the blocked source.
- When using browser capabilities, access only public pages and public APIs. Do not use the user's personal browser profile, cookies, logged-in state, or account permissions to expand the collection scope.
- When a host tool security policy rejects access to a domain, that rejection takes precedence over this skill's collection goal. Do not use other browser paths or command-line requests to bypass the security policy.
- Companies and channels must be collected separately. Without an explicit page source, do not reuse a campus recruiting page for experienced-hire recruiting, and do not reuse an experienced-hire page for campus recruiting.

## Self-Upgrade

When the user asks to upgrade this skill, use the official Codex `$skill-installer` or an equivalent official skill management capability to reinstall this skill:

```text
repo: Stargazer1492/caffronix-agent-skills
path: ai-job-analyze
ref: main
```

If the official installer detects that `ai-job-analyze` already exists and refuses to overwrite it, explain to the user that this is an upgrade scenario and ask the user to confirm whether to overwrite the installed skill. Before the user confirms, do not delete or overwrite `$CODEX_HOME/skills/ai-job-analyze` or `~/.codex/skills/ai-job-analyze`. After the upgrade is complete, confirm that `SKILL.md` exists in the target directory and tell the user to restart Codex.

## References

- Read `references/company-sources.md` before adding or modifying company sources.
- Read `references/stage1-collection.md` before changing the collection plan, browser collection, detail-page screenshots, detail-page body extraction, or pagination flow.
- Read `references/stage2-normalization.md` before changing the field normalization flow.
- Read `references/stage3-analyze-and-report.md` before changing the analysis method or report structure.
- Read `references/output-contract.md` before changing output fields or artifact types.
