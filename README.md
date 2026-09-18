# FrictionFix

FrictionFix is a real-time usability testing tool that combines EEG, eye tracking, and behavioral signals to automatically detect where users struggle on a website — and explain why.

---

## What it does

Traditional usability testing requires a facilitator, scheduled sessions, and manual note-taking. FrictionFix runs passively in the background while a participant browses a target URL. It fuses three streams of evidence:

- **EEG cognitive load** — live theta/beta/alpha band-power ratios from an ANT Neuro headset, streamed over LSL and bridged to the browser via WebSocket
- **Eye tracking** — gaze dwell time on individual page elements, captured directly in the browser using WebGazer (no external hardware)
- **Behavioral signals** — rage clicks, repeated clicks, scroll reversals, backtracks, input errors, and inactivity, detected by a lightweight frontend observer

When enough evidence converges on the same page location within a short time window, it becomes a **friction event** — a scored, auditable record of where the user likely hit a wall. Each score is a fixed-weight sum of which evidence types were present, so a `0.82` always means the same thing across sessions.

At the end of a session, friction events are ranked by severity and surfaced alongside AI-generated UX suggestions.

---

## Architecture

```
ANT Neuro eego
      │ LSL (TCP)
  bridge.py  ──WebSocket──▶  React frontend (Vite)
                                    │ REST
                              Python backend (FastAPI)
```

**Frontend** (`src/`) — React + Tailwind + Framer Motion. Three screens: signal setup, live study view with embedded target site, results. Connects to the EEG bridge over WebSocket on port 4514 and to the backend REST API on port 8000.

**Backend** (`backend/`) — Python session lifecycle engine. Manages calibration trials, EEG feature extraction, friction episode aggregation, gaze and event ingestion, and session persistence to SQLite. Exposes a REST API consumed by the frontend.

**Bridge** (`bridge.py`) — Standalone Python script. Auto-discovers the eego machine on the local network by TCP-scanning the /24 subnet for the LSL port. Streams cognitive load scores to any connected browser client over WebSocket.

---

## Getting started

### Prerequisites

- Node.js 18+
- Python 3.11+
- ANT Neuro eego software running with LSL enabled (Extras → LSL → Start)

### Frontend

```bash
npm install
npm run dev
```

### Backend

```bash
cd backend
pip install -e .
uvicorn frictionfix.app:app --reload
```

### EEG bridge

```bash
pip install pylsl websockets numpy
python3 bridge.py
```

The bridge auto-discovers the eego machine on your local network. To skip the scan and connect directly:

```bash
python3 bridge.py --eeg-host 192.168.1.42
```

---

## Session flow

1. **Signal setup** — connect the EEG bridge, enable eye tracking, verify signal quality
2. **Calibration** — run a short low/high friction task to fit a per-participant classifier
3. **Study** — participant browses the target URL; evidence streams in live
4. **Results** — friction events ranked by severity, with page location, evidence breakdown, and suggestions
