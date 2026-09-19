# Platform Contract 13

Remote is the product. Host is the security/browser runtime.

### Remote-owned
UI, JavaScript, theme, cards, settings, Agents, schedules, pipelines, selectors, URLs, retries, validation, reports, dashboards, charts, icons, messages, data sources and transformations.

### Host-owned
Credentials, access enforcement, Chrome permissions, generic browser automation, generic HTTP/XLSX/storage/alarms, secure Authenticator and diagnostics.

### Update policy
Normal product work is Remote-only. Host 13 is updated only for security, Chrome/Manifest compatibility, or a missing privileged primitive.


## Secure local embed URL
Host 13.0.4 adds the generic `localPage.getUrl` method. It returns URLs only for allowlisted Host-local pages. A returned page is embeddable only when the Host manifest explicitly exposes it to the trusted Remote origin.
