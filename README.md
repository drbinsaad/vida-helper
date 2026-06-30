# VIDA Browser Helper

Safe starter kit for building a VIDA browser helper that can run on:

- Chrome on Mac, through Tampermonkey or the unpacked extension folder.
- Safari on iPhone, through the Userscripts app.
- Safari/Chrome on Mac, through a userscript manager.

The current dashboard script is a safe workflow helper. It highlights VIDA
fields/buttons, captures sanitized snapshots, and can insert your own saved
quick-text templates into free-text fields. It does not click Add, Continue, or
Save for patient-record actions.

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

- `userscripts/vida-dashboard-helper.user.js`: install this in Tampermonkey or
  iPhone Safari Userscripts for the active workflow helper.
- `userscripts/vida-helper.user.js`: older snapshot-only starter script.
- `chrome-extension/`: unpacked Chrome extension version.
- `docs/INSTALL-MAC.md`: Mac install steps.
- `docs/INSTALL-IPHONE.md`: iPhone install steps.
- `docs/NEXT-CAPTURE.md`: what to capture next so we can build the real action.

## Next Build Step

After installing the userscript, log in to VIDA, go to the exact page you want to
speed up, and use the floating `VIDA Helper` panel. For autofill, click a
free-text field, type a reusable phrase once, press `Save Field`, then use
`Insert Text` later to draft it into the active field for manual review.

Paste that snapshot back here after checking it has no patient name, MRN, phone,
or ID number. Then I can build the exact action script for your workflow.
