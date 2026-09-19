# DigiExpress Remote v350 changed files

Fixes Authenticator launch from the Remote shell. The click handler now calls the exported `globalThis.DigiExpressPlatform` bridge instead of an out-of-scope local variable.

Host update is not required. Keep Host 13.0.2.
