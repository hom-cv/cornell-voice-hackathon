# Aircraft Inspection Handoff App

## Goal
Build a native, notes-first application that helps aircraft inspection workers create clear shift handoff documents faster, so incoming workers understand the current state and outstanding work.

## Core workflow
- Capture inspection observations, completed work, and pending action items via voice.

## Product principles
- Keep note-taking fast and familiar.
- Keep the UI simple stupid, do not introduce multi-layered AI unless necessary

## Current prototype
- Initial implementation assumes macOS + SwiftUI for speed; the final target platform remains open.
- Includes local notes

## Scope of this reference
This is the high-level source of truth for contributors and agents. Keep it brief, update it as decisions are made, and do not treat open decisions as settled requirements.

## AI Integreation
- Must use Bonsai 2B, 4B, or 9B
- Uses Argmax OSS for voice recognition
