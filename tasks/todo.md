# FrictionFix — Frontend

- [x] Install `@shadergradient/react`.
- [x] Add the shared OpenAI-style font and translucent visual system.
- [x] Add the animated ShaderGradient background to the app shell.
- [x] Build the app and inspect the changed UI.
- [x] Commit and push the logical changes.

## Review

- `npm run build` passes with the exact requested shader colors.
- The renderer uses `@react-three/fiber@8` to remain compatible with React 18.

---

# FrictionFix — Backend

- [x] Inspect challenge data and existing repository.
- [x] Define separate backend scope; teammate owns the demo frontend.
- [x] Implement EEG windows, quality checks, participant calibration and adaptation policy.
- [x] Implement API, real behavioural metrics, persistence and frontend contract.
- [x] Implement ANT replay, optional LSL bridge and offline success/failure evaluation.
- [x] Verify synthetic edge cases, HTTP integration and supplied recordings.
- [x] Document setup, limitations, AI use and commit the backend branch.

## Design

Local Python service, React-independent HTTP/WebSocket API. The frontend owns
task content and reports actual validation results; the backend never receives
typed values. EEG windows use explicit units and an explicit ordered channel list.
Calibration uses independent form trials, with EEG collected before the reported
outcome. No flip-cup model is described as a validated website-confusion model.
Replay and manual actions remain labelled throughout exports.

## Review

15 automated tests pass. TypeScript adapter passes strict compilation. Supplied
recording replay passes a real HTTP smoke test. Synthetic LSL outlet-to-bridge-to-API
transport passes. Flip-cup holdout: 28/50 correct (56%), balanced accuracy 54.8%,
versus training-majority baseline 48%; insufficient evidence of reliable prediction.
Actual ANT cap and teammate frontend remain unverified. See backend/VALIDATION.md.

---

# Repository cleanup

- [x] Review the README against the current frontend and backend implementation.
- [x] Add the live demo, local setup, architecture, repository guide, and integration limits.
- [x] Move the challenge handout into `docs/` and link it from the README.
- [x] Add contributor guidance, editor conventions, and broader local-file exclusions.
- [x] Add GitHub Actions checks for the frontend build and backend tests.
- [x] Verify documentation links, production build, backend tests, and whitespace.

## Review

The backend suite passes with 38 tests on Python 3.12 / macOS. The frontend
production build passes; Vite reports the existing large bundle warning.
Documentation links resolve locally. Live hardware and hosted backend connectivity
were not tested as part of this documentation and repository maintenance change.
