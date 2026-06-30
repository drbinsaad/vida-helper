# VIDA Browser Helper

Safe starter kit for building a VIDA browser helper that can run on:

- Chrome on Mac, through Tampermonkey or the unpacked extension folder.
- Safari on iPhone, through the Userscripts app.
- Safari/Chrome on Mac, through a userscript manager.

The current dashboard script is a safe workflow helper. It highlights VIDA
fields/buttons, captures sanitized snapshots, inserts your own saved quick-text
templates into free-text fields, and can save/apply local medication draft
presets for prescription drawers. It can also copy/mark previous prescription
cards so you can review them before manually using Refill. It does not click
Add, Continue, Refill, or Save for patient-record actions.

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
`Insert Text` later to draft it into the active field for manual review. For
common medications, open a prescription drawer after choosing the medication and
details, press `Save Rx`, then later use `Find Item`, `Apply Rx`, and `Copy Rx`
to speed up drafting while keeping Add/Save manual. `Find Item` also focuses the
procedure search on the `Orders` tab, but Rx drafts stay limited to
`Prescriptions`. On the `Previous Prescriptions` list, tap a previous prescription card, then use `Copy Prev` or
`Mark Prev`; the `Refill` click stays manual.

Paste that snapshot back here after checking it has no patient name, MRN, phone,
or ID number. Then I can build the exact action script for your workflow.
