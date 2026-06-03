---
name: use-web-agent
description: 使用Chrome操作ChatGPT、DeepSeek、Grok等网页版AI Agent，并通过视觉截图返回完整回复。适用于用户要求Codex在已登录的浏览器会话中调用ChatGPT、DeepSeek或Grok，运行某个提示词、对比或测试网页版AI Agent、截取Agent回复，或显式调用use-web-agent。
---

# Use Web Agent

## Overview

Operate browser-based AI agents through the user's Chrome session, wait for the answer to finish, capture the result with screenshots, and return the visible answer.

This skill supports multiple web agents. First identify the intended agent, then run that agent's workflow. Use screenshots as the primary source of truth for navigation, waiting, result capture, and final reporting.

## Hard Rules

- Use the Chrome plugin and its `control-chrome` workflow. If the Node REPL `js` tool is not already available, use tool discovery for the Node REPL tool as instructed by the Chrome skill.
- Prefer the user's existing logged-in Chrome session. Reuse an already-open target page when the visible page and task context match.
- Operate through visual browser actions: screenshots, visible tab selection, coordinate clicks, typing, keypresses, visible menus, and scrolling.
- Do not use reverse engineering or non-visual extraction. Avoid private APIs, network inspection, page source, DOM snapshots, DOM locators, JavaScript evaluation, CSS selectors, XPath, clipboard reads, local storage, cookies, session stores, or internal endpoints.
- Do not use web search or another browser backend to replace the requested web agent. The result must come from the selected agent's visible web UI.
- Do not read private browser data. Only observe what is visible in the active Chrome tab.
- If login, CAPTCHA, account restrictions, rate limits, subscription prompts, or other user-only actions block progress, stop and ask the user to complete the visible blocker in Chrome.

## Agent Selection

Choose the agent from the user's wording:

- Use ChatGPT when the user says ChatGPT, OpenAI web agent, chatgpt.com, GPT, `PRO`, Thinking model selection, or asks to use the default web agent without naming Grok.
- Use DeepSeek when the user says DeepSeek, deepseek, chat.deepseek.com, 专家模式, 深度思考, or asks to use the DeepSeek web agent.
- Use Grok when the user says Grok, X Grok, x.com, Twitter/X agent, or asks to use the migrated `grok-in-x` behavior.
- If the user asks for multiple agents, run them one at a time and keep separate screenshots and result summaries for each agent.
- If the requested agent is ambiguous and the task would affect a live account or spend paid quota, ask a short clarification. Otherwise default to ChatGPT.

## Shared Result Capture

- Wait until the answer is complete before reporting.
- Take screenshots during waiting and after completion.
- If the answer is longer than one viewport, scroll upward and downward to capture every hidden portion. Use overlapping screenshots so no lines are missed.
- Return the answer based on screenshots. Include screenshot paths or rendered screenshots when available.
- If text is too small, blurred, or partially hidden, adjust zoom or viewport through visible browser controls, then capture again.
- If any portion cannot be read confidently from screenshots, state the limitation and ask whether to continue with another screenshot pass.

## ChatGPT Workflow

Use this workflow for `https://chatgpt.com/`.

1. Find or open ChatGPT:
   - Inspect visible Chrome tabs through the Chrome plugin's user-tab list only to identify already-open pages by visible title and URL.
   - If a `https://chatgpt.com/` page is already open, claim and reuse it.
   - If no ChatGPT tab is open, open `https://chatgpt.com/` in Chrome.
2. Decide whether to reuse the current conversation:
   - Look at the visible conversation title, current messages, and left-sidebar history.
   - If the current visible conversation topic matches the user's current task topic, reuse it.
   - If the topic does not match, go to step 3.
3. Start a new chat:
   - In the left sidebar, find `新聊天` or the equivalent visible new-chat control and click it.
   - If the sidebar is collapsed, expand it first using the visible sidebar control.
4. Enter the prompt:
   - In the right chat area, find the message input box.
   - Click the input box and type the exact user-provided content.
5. Select the model:
   - Look at the model selector near the right side of the input area.
   - Confirm it shows `PRO`.
   - If it does not show `PRO`, click the model selector and choose `PRO`.
   - If `PRO` is not visible, choose `Thinking`.
   - If neither `PRO` nor `Thinking` is visible, leave the current model unchanged and continue.
6. Send:
   - Click the visible send button.
7. Wait for completion:
   - Every 5 seconds, take a screenshot and compare it with the previous screenshot visually.
   - Continue while the answer changes, a stop button is visible, a generating indicator is visible, or new text appears.
   - Treat output as complete only after the visible answer is unchanged for three consecutive 5-second checks.
8. Capture and return:
   - Screenshot the completed reply.
   - If the reply is not fully visible in one page, scroll to show hidden portions and capture additional overlapping screenshots.
   - Return the visible answer and include the screenshot path or rendered screenshot when available.

## DeepSeek Workflow

Use this workflow for `https://chat.deepseek.com/`.

1. Find or open DeepSeek:
   - Inspect visible Chrome tabs through the Chrome plugin's user-tab list only to identify already-open pages by visible title and URL.
   - If a `https://chat.deepseek.com/` page is already open, claim and reuse it.
   - If no DeepSeek tab is open, open `https://chat.deepseek.com/` in Chrome.
2. Decide whether to reuse the current conversation:
   - Look at the visible conversation title, current messages, and left-sidebar history.
   - If the current visible conversation topic matches the user's current task topic, reuse it.
   - If the topic does not match, go to step 3.
3. Start a new conversation:
   - In the left sidebar, find `开启新对话` and click it.
   - If the sidebar is collapsed, expand it first using the visible sidebar control.
4. Configure reasoning mode:
   - In the right chat area, choose `专家模式`.
   - Confirm `深度思考` is selected.
   - If `深度思考` is visible but not selected, click it to select it.
   - If either control is not visible, inspect the current screen with another screenshot and use the visible equivalent control. If no equivalent exists, leave the current mode unchanged and continue.
5. Enter the prompt:
   - Find the message input box.
   - Click the input box and type the exact user-provided content.
6. Send:
   - Click the visible send button.
7. Wait for completion:
   - Every 5 seconds, take a screenshot and compare it with the previous screenshot visually.
   - Continue while the answer changes, a stop button is visible, a generating indicator is visible, or new text appears.
   - Treat output as complete only after the visible answer is unchanged for three consecutive 5-second checks.
8. Capture and return:
   - Screenshot the completed reply.
   - If the reply is not fully visible in one page, scroll to show hidden portions and capture additional overlapping screenshots.
   - Return the visible answer and include the screenshot path or rendered screenshot when available.

## Grok Workflow

Use this workflow for Grok inside X.

1. Start the Chrome plugin runtime and open a new or selected Chrome tab.
2. Navigate visually to `https://x.com`.
3. From the visible page, click the left sidebar item labeled `Grok`. If the layout is compact, use the visible Grok icon or menu item after confirming it from the screenshot.
4. In the Grok page, click the top-right `New Chat` button. If a welcome screen already shows a fresh input and no existing conversation is active, still look for `New Chat` first before using the current input.
5. Click the bottom prompt input, type the exact user prompt, and submit it with the visible send control or the keyboard shortcut shown by the UI.
6. Wait for Grok to finish:
   - Take repeated screenshots while the reply is changing.
   - Continue waiting while there is a typing indicator, animated loading state, disabled send control, stop button, streaming cursor, or visibly changing text.
   - Treat the reply as complete only after the visible answer remains stable across at least two checks separated by a short wait and no generation indicator remains.
7. Capture the completed answer:
   - Take a screenshot of the visible completed reply.
   - If the answer is not fully visible in the current viewport, scroll upward until the beginning of the Grok reply is visible, then take additional screenshots as needed.
   - Prefer overlapping screenshots when a long answer spans multiple viewports, so no lines are missed.
8. Return the result:
   - Provide the Grok answer based on the captured screenshots.
   - Include the screenshot path or rendered screenshot when available.
   - If any portion cannot be read confidently from screenshots, state that limitation and ask whether to continue with another screenshot pass.

## Extending To More Agents

When adding another web agent, keep the same structure:

- Add a selection rule under Agent Selection.
- Add one workflow section with target URL, session reuse rule, new-chat rule, input rule, model or mode selection rule, wait-completion rule, and screenshot capture rule.
- Keep provider-specific details in that section. Leave shared safety, visual-only, and result-capture rules in the common sections.
