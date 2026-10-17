# Contributing to FrictionFix

Follow the [README](README.md#run-locally) to start the frontend and optional backend.
Use `npm ci` to install the JavaScript dependencies from the committed lockfile.
For backend development, install `backend` with the `test` extra in a virtual environment.

## Project conventions

- Keep UI screens in `src/screens/`, reusable components in `src/components/`, and API helpers in `src/lib/`.
- Keep signal processing, session logic, and API validation in `backend/frictionfix/`.
- Match the surrounding code style. JavaScript uses two spaces and Python uses four.
- Update the relevant guide when changing setup, API behavior, or signal assumptions.
- Clearly distinguish simulated, replayed, and live signals in results and documentation.
- Keep credentials, session databases, raw recordings, and generated reports out of Git.
- Preserve the vendored MediaPipe assets in `public/mediapipe/`; avoid formatting third-party code.

## Before submitting changes

Run the checks relevant to your change:

```bash
# Repository root: production frontend build
npm run build

# Backend directory, with its virtual environment activated
python -m pytest -q

# Repository root: whitespace errors
git diff --check
```

For UI changes, also check the affected screens in the browser. For signal changes,
include meaningful synthetic or replay checks and record hardware limitations in
[backend/VALIDATION.md](backend/VALIDATION.md).

Use focused commits with descriptive messages such as `docs: clarify EEG setup` or
`fix: reject stale gaze observations`. Pull requests should explain the resulting
behavior and include the checks performed.
