# VIDA Browser Helper

Safe starter kit for building a VIDA browser helper that can run on:

- Chrome on Mac, through Tampermonkey or the unpacked extension folder.
- Safari on iPhone, through the Userscripts app.
- Safari/Chrome on Mac, through a userscript manager.

The current script is intentionally read-only. It inspects the current VIDA page,
shows route/login/API activity, and captures a sanitized DOM snapshot so the real
workflow can be built without exposing patient data.

## What I learned from the public app

- App URL: `https://vida.hmg.com/`
- App type: Angular single-page app.
- Main API base found in the bundle: `https://vida.hmg.com:8081/api`
- Auth storage keys found in the bundle: `access_token`, `refresh_token`,
  `memberinfo`
- Login flow uses username, password, facility, captcha, and may require OTP.
- OPD/worklist code references:
  - `opd-details-list`
  - `opd-details`
  - `medicalrecord/patientarrivallist`
  - `medicalrecord/EpisodeForRegularVisit`

## Files

- `userscripts/vida-helper.user.js`: install this in Tampermonkey or iPhone
  Safari Userscripts.
- `chrome-extension/`: unpacked Chrome extension version.
- `docs/INSTALL-MAC.md`: Mac install steps.
- `docs/INSTALL-IPHONE.md`: iPhone install steps.
- `docs/NEXT-CAPTURE.md`: what to capture next so we can build the real action.

## Next Build Step

After installing the userscript, log in to VIDA, go to the exact page you want to
automate, press `VIDA` in the floating panel, then press `Copy Snapshot`.

Paste that snapshot back here after checking it has no patient name, MRN, phone,
or ID number. Then I can build the exact action script for your workflow.
