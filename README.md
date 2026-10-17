<div align="center">

# FrictionFix

### Understand where users struggle.

Eye tracking, EEG signals, and interaction analysis in one usability research workspace.

**[Explore the live demo →](https://frictionfix.netlify.app/)**

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)

</div>

## Overview

A click tells you what someone did. It takes more context to understand what made the experience difficult.

FrictionFix brings together where people look, how they interact, and changes in EEG activity to help investigate friction on a website. Built during a hackathon, the project connects a React study interface with webcam-based eye tracking, ANT Neuro hardware integration, and a Python analysis backend.

## Features

- **Interactive study workspace** — Open a target website, run a timed browsing session, and review the results in one place.
- **Gaze tracking and heatmaps** — Use webcam-based eye tracking to visualize attention and identify sustained fixations.
- **Live EEG integration** — Stream EEG-derived load indicators from an ANT Neuro eego headset into the interface over WebSocket.
- **Evidence-based friction scoring** — The backend combines supplied gaze, interaction, and calibrated EEG evidence into episodes with a clear score breakdown.
- **AI-assisted UX suggestions** — Generate contextual suggestions for improving the page or element being studied.

## How it works

The browser captures gaze through WebGazer and displays it over the study workspace. A Python bridge discovers EEG streams through Lab Streaming Layer, extracts spectral band power, and sends load updates to the interface.

The FastAPI backend manages sessions and supports gaze observations, browser events, and a separate EEG processing pipeline with signal-quality checks and participant-specific calibration. It groups qualifying evidence by page and element, scores friction episodes, and stores session records in SQLite for review and export.

## Engineering highlights

- Canvas-based gaze visualization keeps frequent tracking updates outside React’s render cycle.
- Local-network EEG discovery connects the hardware stream to the browser without a fixed device IP.
- Signal processing uses NumPy and SciPy, with participant calibration built on scikit-learn.
- Validated, idempotent observation ingestion supports reliable retries and consistent session records.

## Tech stack

| Layer | Technologies |
| --- | --- |
| Interface | React, Vite, Tailwind CSS, Framer Motion |
| Tracking and visualization | WebGazer, MediaPipe, Three.js, ShaderGradient |
| Backend and storage | Python, FastAPI, SQLite |
| Signal processing | NumPy, SciPy, scikit-learn, Lab Streaming Layer |
| AI integrations | Anthropic, Gemini through Vertex AI |
