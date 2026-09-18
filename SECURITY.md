# Security

## Reporting a vulnerability

Please report security issues privately through GitHub's "Report a vulnerability"
button on the Security tab, not in a public issue. Include steps to reproduce and
the version affected. Expect a first reply within a week.

## How Zunn is hardened

- The window runs with `contextIsolation` and `sandbox` on and `nodeIntegration` off.
- The renderer talks to the main process only through a small, named IPC bridge.
- A strict Content-Security-Policy blocks remote scripts, frames, forms and plugins.
- The window cannot navigate away or open new windows. Only http, https and mailto links go to your browser.
- All permission requests (camera, microphone, location, and so on) are denied.
- No network requests are made by the app. Data stays in one local JSON file.

## Things to know

- Zunn launches programs and paths you add. Only import data files you trust.
- Release builds are unsigned. Windows SmartScreen and macOS Gatekeeper will warn on first run.
