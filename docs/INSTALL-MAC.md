# Install On Mac

## Chrome with Tampermonkey

1. Install Tampermonkey in Chrome.
2. Open `userscripts/vida-dashboard-helper.user.js`.
3. Copy the file content into a new Tampermonkey script.
4. Save it.
5. Open `https://vida.hmg.com/`.
6. After login, look for the floating `VIDA Helper` panel.

Direct Tampermonkey import URL:

`https://raw.githubusercontent.com/drbinsaad/vida-helper/main/userscripts/vida-dashboard-helper.user.js`

## Chrome unpacked extension

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable Developer Mode.
4. Click `Load unpacked`.
5. Select the `chrome-extension` folder in this project.
6. Open `https://vida.hmg.com/`.

The unpacked extension and starter userscript are more limited than the dashboard
userscript. Use Tampermonkey for the current quick-text workflow helper.
