# Next Capture

To build the real automation, I need one sanitized snapshot from the exact page
where you want the helper to act.

## Capture Steps

1. Install `userscripts/vida-helper.user.js`.
2. Log in to VIDA normally.
3. Go to the exact page you want automated.
4. Tap or click the floating `VIDA` button.
5. Press `Copy Snapshot`.
6. Paste it back into the chat after checking it is sanitized.

## What The Snapshot Contains

- Current route and URL path.
- Whether auth keys exist, without copying token values.
- Recent API paths, with query strings and long numbers redacted.
- Visible button/input/link labels.
- Safe element selectors for visible controls.

## What The Snapshot Should Not Contain

The helper tries to redact common patient identifiers, but review before sending:

- Patient names.
- MRN or national ID.
- Phone numbers.
- Free-text clinical notes.
- Any real patient-specific detail.

## Tell Me The Goal

Along with the snapshot, write the workflow in this shape:

```text
Goal: ...
Start page: ...
Steps:
1. Click ...
2. Wait until ...
3. Click ...
Stop when: ...
Do not click: ...
```
