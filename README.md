<div align="center">

# FrictionFix

### Understand where users struggle.

A usability research workspace with webcam eye tracking, live EEG visualization, and a backend for analyzing interaction evidence.

**[Explore the live demo →](https://frictionfix.netlify.app/)**

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)

</div>

## Overview

Understanding a difficult user experience takes more than knowing where someone clicked. FrictionFix explores how gaze, EEG activity, and interaction evidence can give usability researchers more context about moments of hesitation.

Built during a hackathon, the project spans a React study interface, an EEG streaming bridge, and a Python analysis backend.

## Features

- **Study workspace** — Load an embedded website, run a timed browsing session, and review recorded results.
- **Webcam eye tracking** — Calibrate gaze tracking, visualize attention with a live heatmap, and detect sustained fixations.
- **Live EEG display** — Connect an ANT Neuro eego LSL stream and display a load indicator derived from EEG frequency bands over WebSocket.
- **Friction analysis API** — Group incoming gaze, browser events, and calibrated EEG evidence into episodes scored by their contributing evidence types.
- **Session reports** — Review recorded friction events and export results as JSON.
- **AI suggestion service** — A configurable Gemini integration through Vertex AI generates UX suggestions from the backend’s recorded evidence.

## Engineering

**Gaze visualization.** WebGazer estimates gaze from the webcam. The heatmap draws radial gradients on a 2D canvas, while refs and animation values handle frequent position updates without a React state update for every gaze sample.

**EEG streaming.** The browser bridge looks for LSL sources on the local network, computes theta, alpha, and beta band power, and streams a derived load indicator over WebSocket. A separate backend EEG pipeline provides signal-quality checks, feature extraction, recorded replay, and participant-specific calibration.

**Session analysis.** FastAPI accepts gaze observations and browser events, validates timestamps and identifiers, and handles duplicate submissions. The scoring engine groups evidence by page and element and counts distinct evidence types within each episode. Session records are stored in SQLite.

## Tech stack

| Component | Technologies |
| --- | --- |
| Interface and animation | React, Vite, Tailwind CSS, Framer Motion |
| Eye tracking | WebGazer |
| Gaze heatmap | HTML Canvas 2D |
| Animated background | ShaderGradient, Three.js |
| Backend and storage | Python, FastAPI, SQLite |
| EEG processing and calibration | NumPy, SciPy, scikit-learn, Lab Streaming Layer |
| Backend AI suggestions | Gemini through Vertex AI |
