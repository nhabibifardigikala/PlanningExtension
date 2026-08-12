# Universal Declarative Workflow DSL v1

A remote operation may declare `engineMode: "universal"` and a `workflow` array.

Control nodes: `sequence`, `set`, `if`, `switch`, `forEach`, `while`, `retry`, `checkpoint`, `sleep`, `emit`.
Browser nodes: `tab.open`, `tab.navigate`, `tab.close`, `dom`, `dom.wait`.
Network/data nodes: `fetch`, `array.push`, `array.map`, `download`, `secret`.

DOM commands: `exists`, `count`, `text`, `value`, `attr`, `html`, `click`, `clickPoint`, `fill`, `type`, `press`, `checked`, `select`, `focus`, `blur`, `scroll`, `table`, `snapshot`.

All values support templates such as `{{input.email}}`, `{{row.id}}`, `{{vars.attempt}}`.
Conditions support `equals`, `notEquals`, `contains`, `startsWith`, `endsWith`, `truthy`, `falsy`, `gt`, `gte`, `lt`, `lte`, `regex`, and `in`, plus `all`, `any`, and `not` composition.

Tab sessions are named. A batch can open a background tab once with `tab.open`, reuse it through every row, and close it only in lifecycle cleanup. Pause, resume and cancel are runtime controls, not operation-specific code.
