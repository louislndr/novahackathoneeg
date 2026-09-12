#!/usr/bin/env python3
"""
FrictionFix — ANT Neuro EEG WebSocket bridge (LSL → WebSocket)

Reads live EEG from any LSL stream (ANT Neuro eego, BrainAmp, etc.),
computes a cognitive load score, and streams it to the web app.

Setup (one-time):
    pip install pylsl websockets numpy

Run each session:
    1. Open ANT Neuro eego software and start a recording
    2. Enable LSL streaming in eego (Extras → LSL)
    3. python3 bridge.py

The bridge auto-detects the first EEG stream on the network.
"""

import asyncio
import json
import numpy as np
import websockets
from pylsl import StreamInlet, resolve_byprop, LostError

WS_PORT    = 4514
UPDATE_HZ  = 10       # updates per second to browser
WINDOW_S   = 2        # seconds buffered for band power
LSL_TIMEOUT = 10      # seconds to wait for LSL stream


def band_power(data: np.ndarray, srate: float, lo: float, hi: float) -> float:
    n = data.shape[0]
    freqs = np.fft.rfftfreq(n, d=1.0 / srate)
    fft   = np.abs(np.fft.rfft(data)) ** 2
    mask  = (freqs >= lo) & (freqs <= hi)
    return float(np.mean(fft[mask])) if mask.any() else 0.0


def compute_load(buf: np.ndarray, srate: float) -> float:
    """
    (theta + beta) / alpha averaged across channels → 0–100 score.
    """
    if buf.shape[0] < int(srate):
        return 30.0
    ratios = []
    for ch in range(buf.shape[1]):
        ch_data = buf[:, ch] - buf[:, ch].mean()
        alpha = band_power(ch_data, srate, 8.0, 13.0)
        theta = band_power(ch_data, srate, 4.0,  8.0)
        beta  = band_power(ch_data, srate, 13.0, 30.0)
        ratios.append((theta + beta) / max(alpha, 1e-9))
    ratio = float(np.mean(ratios))
    return round(float(np.clip((ratio - 0.5) / 4.0 * 80 + 10, 0, 100)), 1)


async def handle_client(websocket):
    print("Browser connected — searching for LSL EEG stream…")
    streams = resolve_byprop('type', 'EEG', timeout=LSL_TIMEOUT)
    if not streams:
        print("No LSL EEG stream found. Start eego and enable LSL streaming.")
        await websocket.close()
        return

    inlet  = StreamInlet(streams[0])
    info   = inlet.info()
    srate  = info.nominal_srate() or 256.0
    n_ch   = info.channel_count()
    win    = int(srate * WINDOW_S)
    buf    = np.zeros((win, n_ch))

    print(f"LSL stream found: {info.name()} · {n_ch}ch · {srate}Hz")

    interval = 1.0 / UPDATE_HZ
    try:
        while True:
            await asyncio.sleep(interval)
            # Pull all available samples since last tick
            samples, _ = inlet.pull_chunk(timeout=0.0, max_samples=int(srate))
            if samples:
                chunk = np.array(samples)
                buf = np.roll(buf, -len(chunk), axis=0)
                buf[-len(chunk):] = chunk[:, :n_ch]

            load     = compute_load(buf, srate)
            channels = buf[-1].tolist()

            await websocket.send(json.dumps({
                "eegLoad":  load,
                "channels": channels,
            }))

    except (websockets.exceptions.ConnectionClosed, LostError):
        print("Disconnected")
    except Exception as e:
        print(f"Bridge error: {e}")
    finally:
        inlet.close_stream()
        print("Session ended — ready for next connection")


async def main():
    print("=" * 50)
    print("FrictionFix EEG bridge  (LSL → WebSocket)")
    print(f"ws://localhost:{WS_PORT}")
    print("=" * 50)
    print()
    print("Before connecting:")
    print("  1. Open ANT Neuro eego software")
    print("  2. Start a recording session")
    print("  3. Enable LSL in eego: Extras → LSL → Start")
    print()
    print("Waiting for browser…")
    async with websockets.serve(handle_client, "localhost", WS_PORT):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
