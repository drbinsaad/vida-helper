# Install On Mac

## Chrome with Tampermonkey

1. Install Tampermonkey in Chrome.
2. Open `userscripts/vida-helper.user.js`.
3. Copy the file content into a new Tampermonkey script.
4. Save it.
5. Open `https://vida.hmg.com/`.
6. After login, look for the small `VIDA` button at bottom right.

## Chrome unpacked extension

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable Developer Mode.
4. Click `Load unpacked`.
5. Select the `chrome-extension` folder in this project.
6. Open `https://vida.hmg.com/`.

The unpacked extension and userscript share the same behavior. Use Tampermonkey
for easier editing; use the extension if you prefer a browser-folder install.
