# v480

- Added **Drop Close Capacity** as a native DigiExpress Capacity workspace.
- Imported the supplied Close Cap Drop Shipping v7 workflow into the main PlanningExtension experience.
- Preserved manual queue input, Excel import/template, pause/resume/cancel, and CSV reporting.
- UI follows DigiExpress light/dark theme and uses the standard application-card visual language.
- The app opens and automates `drop-shipping.digikala.com/shipping-network-capacity/` through the Stable Host Universal Runtime.
- Host 13.0.17 adds one generic browser primitive, `armConfirmOnce`, needed to faithfully replace the supplied extension's MAIN-world confirm bridge. No Drop Shipping business logic lives in Host.
