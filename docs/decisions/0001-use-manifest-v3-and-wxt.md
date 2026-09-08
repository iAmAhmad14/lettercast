# ADR 0001: Use Manifest V3 and WXT

## Status

Accepted

## Context

Lettercast is a browser extension with a Chrome-first v1 and possible future Firefox support. It needs content-script execution, background messaging, least-privilege permissions, and builds that do not create avoidable browser-specific coupling.

## Decision

Build the extension on Manifest V3 using WXT and its cross-browser `browser` API abstraction. Treat the MV3 service worker as ephemeral and register runtime listeners at module top level.

## Rationale

Manifest V3 is the selected extension platform. WXT supplies the extension build model and a consistent API surface across supported browser targets, reducing future migration work without adding Firefox-specific behavior to v1.

## Consequences

Service-worker memory cannot be required for correctness, and every invocation must be safe as a cold start. Extension code must comply with MV3 restrictions, including its default no-remote-code posture. Firefox remains deferred; this decision only avoids implementation choices that would make it unnecessarily difficult later.
