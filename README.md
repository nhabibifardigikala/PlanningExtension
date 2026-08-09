# Digiexpress Remote Configuration

Upload these files to the root of the `PlanningExtension` GitHub repository.
GitHub Pages must deploy from the `main` branch and `/ (root)`.

Public configuration URL:
`https://nhabibifardigikala.github.io/PlanningExtension/app.json`

Do not store usernames, passwords, API keys, tokens, or other secrets here.

## What can be changed without reinstalling the extension
- App title/subtitle and remote logo URL
- Theme colors and menu layout
- Settings labels/messages
- Operation titles, subtitles, icons, enabled state, access-column aliases
- Capacity URL/search timeout/check interval/input labels
- Distribution Center URL/table wait settings
- New operation cards
- Simple new workflows using the declarative remote engine actions: `open`, `navigate`, `wait`, `waitFor`, `fill`, `click`, `press`, `clickOutside`

Complex new browser capabilities or new Chrome permissions still require an extension update.
