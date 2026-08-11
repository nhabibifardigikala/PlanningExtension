# PlanningExtension Remote Application v18

Upload the contents of this package to the root of the PlanningExtension GitHub Pages repository.

This repository is the application definition. Almost all future changes should happen here, without redistributing the extension.

Remote-managed areas include app.json, runtime.json, theme.json, settings.json, messages.json, ui/app.html, ui/app.css, operation definitions, forms, workflows, selectors, URLs, timeout/retry rules, icons and public data files.

The local Runtime v8.0 only contains security enforcement and generic browser/data primitives. Do not place passwords, tokens, cookies or other secrets in this public repository.

The runtime fetches the latest remote bundle every time the side panel opens. If GitHub is temporarily unavailable it falls back to the last known good version stored locally.
