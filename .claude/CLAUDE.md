# graphify
- **graphify** (`.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

That path is not in the repository. The skill body, the hooks and `graphify-out/`
are written by `npm run graphify:setup` and ignored, because `graphify install`
records the absolute path of the binary on the machine that ran it. So a fresh
clone has this file and no skill behind it: run setup, and use the rules in
`AGENTS.md` meanwhile — they describe the graph and hold whether or not the skill
is installed.
