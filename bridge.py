#!/usr/bin/env python3
"""
FrictionFix — g.tec Unicorn Hybrid Black WebSocket bridge

Reads live EEG from the Unicorn via BrainFlow, computes a cognitive load
score from band-power ratios, and streams it to the web app.

Setup (one-time):
    pip install brainflow websockets numpy

Run each session:
    python bridge.py

Requirements:
    - USB Bluetooth dongle plugged in
    - Unicorn headset powered on and in range
"""

import asyncio
import json
import numpy as np
import websockets
from brainflow.board_shim import BoardShim, BrainFlowInputParams, BoardIds
from brainflow.data_filter import DataFilter, DetrendOperations

BOARD_ID    = BoardIds.UNICORN_BOARD   # g.tec Unicorn Hybrid Black
SAMPLE_RATE = 250                       # Hz (fixed by hardware)
WS_PORT     = 4514
WINDOW_S    = 2                         # seconds of data for band power
UPDATE_HZ   = 10                        # updates per second sent to browser


def compute_load(data: np.ndarray, eeg_channels: list) -> float:
    """
    Cognitive load proxy: (theta + beta) / alpha averaged across channels.
    Theta (4-8 Hz) and beta (13-30 Hz) increase under load;
    alpha (8-13 Hz) decreases. Result normalized to 0-100.
    """
    if data.shape[1] < SAMPLE_RATE:
        return 30.0  # not enough data yet — return neutral

    window = SAMPLE_RATE * WINDOW_S
    ratios = []
    for ch in eeg_channels:
        ch_data = data[ch, -window:].copy().astype(float)
        DataFilter.detrend(ch_data, DetrendOperations.CONSTANT.value)
        alpha = DataFilter.get_band_power(ch_data, SAMPLE_RATE, 8.0, 13.0)
        theta = DataFilter.get_band_power(ch_data, SAMPLE_RATE, 4.0, 8.0)
        beta  = DataFilter.get_band_power(ch_data, SAMPLE_RATE, 13.0, 30.0)
        ratios.append((theta + beta) / max(alpha, 1e-9))

    ratio = float(np.mean(ratios))
    # Empirical range: ~0.5 relaxed (load 10) → ~4.5 high load (load 90)
    load = np.clip((ratio - 0.5) / 4.0 * 80 + 10, 0, 100)
    return round(float(load), 1)


async def handle_client(websocket):
    params = BrainFlowInputParams()
    board  = BoardShim(BOARD_ID, params)
    eeg_ch = BoardShim.get_eeg_channels(BOARD_ID)

    try:
        board.prepare_session()
        board.start_stream(SAMPLE_RATE * WINDOW_S * 4)
        print("Unicorn connected — streaming EEG load to browser")

        interval = 1.0 / UPDATE_HZ
        while True:
            await asyncio.sleep(interval)
            data = board.get_board_data()
            if data.shape[1] == 0:
                continue

            load     = compute_load(data, eeg_ch)
            channels = [float(data[ch, -1]) for ch in eeg_ch]

            await websocket.send(json.dumps({
                "eegLoad":  load,
                "channels": channels,
            }))

    except websockets.exceptions.ConnectionClosed:
        print("Browser disconnected")
    except Exception as e:
        print(f"Bridge error: {e}")
    finally:
        try:
            board.stop_stream()
            board.release_session()
        except Exception:
            pass
        print("Session released — ready for next connection")


async def main():
    print("=" * 50)
    print("FrictionFix EEG bridge")
    print(f"Listening on ws://localhost:{WS_PORT}")
    print("=" * 50)
    print()
    print("1. Plug in the USB Bluetooth dongle")
    print("2. Power on the Unicorn Hybrid Black headset")
    print("3. Open FrictionFix in the browser")
    print("4. Go to Signal Setup → enable Live EEG")
    print()
    async with websockets.serve(handle_client, "localhost", WS_PORT):
        await asyncio.Future()


if __name__ == "__main__":
    BoardShim.disable_board_logger()
    asyncio.run(main())
