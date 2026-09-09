# ADR 0011: Distribute v1 as an Unpacked GitHub Release

## Status

Accepted.

## Context

The original release plan targeted the Chrome Web Store. That path requires a US$5 developer registration fee and additional store-submission time. Lettercast v1 is a portfolio/showcase project, so those costs and delays are not justified for its intended use.

## Decision

Distribute Lettercast v1 as a production ZIP attached to a GitHub Release. Users download and extract the ZIP, enable browser Developer Mode, and select **Load unpacked**. The release publishes the tested ZIP, its SHA-256 checksum, and installation notes; GitHub's automatic source archives are not extension packages.

Keep the committed public manifest key and stable extension ID. Do not add a Chrome Web Store listing, Heroku application, web adaptation, automatic updater, embedded credential, or broader CORS policy.

## Rationale

This is the smallest free distribution path that demonstrates the real extension and preserves its reviewed MV3, Cloudflare Worker, privacy, and security boundaries. It avoids store fees and submission lead time without expanding v1 scope.

## Consequences

Users must install and update Lettercast manually. Developer Mode is required, managed browsers may block installation, and there is no Chrome Web Store review or automatic update channel. Release integrity depends on downloading the named build artifact and optionally verifying its published SHA-256 checksum.

The runtime architecture is unchanged. A future Store or signed-package release requires a separate decision, including its own publishing and private-key-retention requirements.
