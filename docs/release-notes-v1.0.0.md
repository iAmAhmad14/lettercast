# Lettercast 1.0.0

Lettercast enhances supported Letterboxd film pages with an extension-owned cast block containing TMDB profile photos and character names. It leaves Letterboxd's native cast content untouched.

## Release assets

Download `lettercast-1.0.0-chrome.zip` and its `.sha256` file from the GitHub Release. Do **not** use GitHub's automatic **Source code** archives.

- SHA-256: `2ce0db5ae36b93dd57a142f85455d1ad29fd203df265ed3901315ad28380121f`
- Stable extension ID: `oibdnmbbockloodlflplcjdfpnnlppnl`

## Install

1. Optionally verify the ZIP against the published SHA-256.
2. Extract the ZIP to a permanent folder.
3. Open `chrome://extensions` and enable **Developer Mode**.
4. Select **Load unpacked**, then choose the extracted directory containing `manifest.json`.
5. Confirm the displayed extension ID matches the value above, then visit a supported Letterboxd film page.

## Update or remove

There is no Chrome Web Store automatic-update channel. To update, replace the extracted files with a newer verified release and select **Reload** on `chrome://extensions`. To remove Lettercast, select **Remove** there and delete the extracted folder.

## Showcase limitations and privacy

This is a portfolio/showcase build. Developer Mode is required, managed browsers may block unpacked extensions, and cast enhancement depends on the Lettercast backend remaining available. The extension is limited to supported Letterboxd film pages, the Lettercast API, and TMDB profile images; it requests no cookies, tabs, or storage permission.

Only the Letterboxd-provided TMDB movie ID leaves the browser. Lettercast does not collect personal data, analytics, cookies, browsing history, client IDs, fingerprints, or user accounts.
