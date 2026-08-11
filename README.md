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


Remote config v9:
- DC User Assignment now submits large DC selections in bounded batches to avoid HTTP 414 Request-URI Too Large.
- `0 - User and DC relation already exists` is treated as a successful no-op outcome.


## Config v12
- DC User Assignment uses up to 15 pages per batch (~300 DCs).
- Existing user/DC relation messages no longer terminate the whole operation; later batches continue.
- Remote Digiexpress logo updated.


## Parent Determination
Remote operation uses `data/DX_Polygons.json` generated from `data/DX_Polygons.xlsx`. The XLSX remains the source dataset in the repository. Update both files together when polygon data changes.
