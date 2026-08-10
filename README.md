# PlanningExtension Remote App v8

Upload the contents of this folder to the root of the GitHub Pages repository.

The application UI is now remote:
- `ui/app.html` = complete Side Panel markup
- `ui/app.css` = complete application appearance

Other remote files:
- `app.json` = app/version/operation registry
- `theme.json` = theme tokens
- `settings.json` = settings labels/options
- `messages.json` = user-facing messages
- `operations/*.json` = forms and workflows

## UI contract
You can redesign/reorder/re-style the UI freely from GitHub, but keep the element IDs used by the runtime (for example `menu`, `settingsBtn`, `operationInputs`, `runOperation`, `username`, `password`, etc.). Removing a required contract ID can make that feature unavailable.

No remote JavaScript is used. This keeps privileged Chrome APIs and credentials inside the installed extension while allowing the visual application and operational behavior to be remotely maintained.
