# FrictionFix

**AI-powered usability testing using eye tracking and EEG signals.**

FrictionFix was built for the **NOVA Buildathon 2026** to help product teams identify where users struggle on a website. It combines webcam-based gaze tracking with cognitive-load signals to detect moments of friction and generate specific recommendations for improving the interface.

## The Problem

Traditional usability testing often depends on surveys, interviews, and manual observation. These methods can miss moments when users are confused but do not say so.

FrictionFix captures behavioural and physiological signals during a browsing session, helping researchers identify possible usability issues as they happen.

## How It Works

1. A researcher enters a website URL and starts a testing session.
2. **WebGazer.js** estimates the participant’s gaze position through their webcam.
3. EEG samples are streamed through **Lab Streaming Layer (LSL)** and processed by a Python bridge.
4. The system combines sustained fixation with elevated cognitive load to detect a possible friction point.
5. Context from the affected page region is sent through a secure AI proxy.
6. The interface displays an actionable UX recommendation and records the event in a session report.

## Features

- Real-time webcam eye tracking and calibration
- Live EEG support through an LSL bridge
- Visual gaze heat map and multi-channel EEG display
- Automatic friction detection using fixation and cognitive-load thresholds
- AI-generated, element-specific UX recommendations
- Session summaries with timestamps and detected friction points
- Exportable JSON reports
- Simulation mode for demonstrations without EEG hardware

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React, Vite, Tailwind CSS |
| Eye Tracking | WebGazer.js |
| EEG Pipeline | Python, Lab Streaming Layer |
| Backend | FastAPI |
| AI | Gemini through Vertex AI |
| Deployment | Google Cloud Run |

## Run Locally

Install the dependencies:

```bash
npm install
