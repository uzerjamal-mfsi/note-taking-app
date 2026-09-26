---
description: Open a PR for the current branch linked to JIRA and OpenSpec change
allowed-tools: Bash(git:*), mcp__bitbucket__*, mcp__atlassian__*
---
1. Run `git diff main...HEAD --stat` and summarize the change by area (shared / api / web).
2. Find the active OpenSpec change in openspec/changes/ and its JIRA ID.
3. Build a PR description:
   - Summary, JIRA link, OpenSpec change path
   - Table: spec scenario → test file(s) covering it
   - New npm packages (with reason), new Prisma migrations / indexes, feature flags
4. Push the branch (ask me first) and open the PR targeting main.
5. Comment on the JIRA ticket with the PR link.
$ARGUMENTS