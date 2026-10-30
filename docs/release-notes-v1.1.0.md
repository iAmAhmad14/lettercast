# Lettercast 1.1.0

Lettercast enhances supported Letterboxd film pages with an extension-owned cast block containing TMDB profile photos and character names. It leaves Letterboxd's native cast content untouched.

## What's new in 1.1.0

- **Cast-tab-scoped visibility:** The **Cast portraits** section is now mounted as the last child of Letterboxd's native `#tab-panel-cast` container ([ADR 0012](decisions/0012-render-inside-the-native-cast-tab-panel.md)). It automatically hides when you switch to the **Crew**, **Details**, **Genres**, or **Releases** tab and reappears when you select **Cast**.
- **Direct film tab-route support:** Opening or refreshing `/film/{slug}/cast/`, `/crew/`, `/details/`, `/genres/`, or `/releases/` directly now enhances the cast tab panel ([ADR 0012](decisions/0012-render-inside-the-native-cast-tab-panel.md)).
- **Clickable Letterboxd actor links:** Clicking a cast member's portrait or name opens that actor's native Letterboxd profile (`https://letterboxd.com/actor/.../`) in a new tab when an exact, unique same-page match exists in Letterboxd's cast list ([ADR 0013](decisions/0013-link-cast-cards-to-native-letterboxd-actor-pages.md)).

## Release assets

Download `lettercast-1.1.0-chrome.zip` and its `.sha256` file from the GitHub Release. Do **not** use GitHub's automatic **Source code** archives.

- SHA-256: `267fe76ca34db5eead0e2830280b68b6de5d0516aedf9d25cb5955c387bffb88`
- Stable extension ID: `oibdnmbbockloodlflplcjdfpnnlppnl`

## Install or update from 1.0.0

1. Optionally verify the ZIP against the published SHA-256.
2. Extract `lettercast-1.1.0-chrome.zip` to your permanent unpacked extension folder (replacing the 1.0.0 files if updating).
3. Open `chrome://extensions` and ensure **Developer Mode** is enabled.
4. For a fresh install, select **Load unpacked** and choose the extracted directory containing `manifest.json`. If updating from 1.0.0, click **Reload** on the Lettercast card.
5. Confirm the displayed extension ID is `oibdnmbbockloodlflplcjdfpnnlppnl` and version is `1.1.0`, then visit a supported Letterboxd film page.

## Showcase limitations and privacy

This is a portfolio/showcase build. Developer Mode is required, managed browsers may block unpacked extensions, and cast enhancement depends on the Lettercast backend remaining available. The extension is limited to supported Letterboxd film pages, the Lettercast API, and TMDB profile images; it requests no cookies, tabs, or storage permission.

Only the Letterboxd-provided TMDB movie ID leaves the browser. Actor-link resolution is performed locally against the page's existing Letterboxd cast anchors without extra network requests. Lettercast does not collect personal data, analytics, cookies, browsing history, client IDs, fingerprints, or user accounts.
