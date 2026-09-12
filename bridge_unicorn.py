#!/usr/bin/env python3
"""
FrictionFix — Unicorn Hybrid Black WebSocket bridge (BrainFlow → WebSocket)

Bridges the g.tec Unicorn Hybrid Black to the browser via WebSocket.
The browser app connects to ws://localhost:4514 — run this on the same machine.

Setup (one-time):
    pip install brainflow websockets numpy

Run each session:
    1. Power on the Unicorn Hybrid Black
    2. Pair it via Bluetooth on your computer
    3. Find its serial port (see below) and run:
       Mac/Linux:  python3 bridge_unicorn.py --serial /dev/tty.UN-XXXXXXXX-SerialPort
       Windows:    python  bridge_unicorn.py --serial COM3
                   (Windows uses "python" not "python3" — install from python.org, not Microsoft Store)

Finding the serial port:
    Mac:     ls /dev/tty.UN-*
    Linux:   ls /dev/rfcomm*
    Windows: Device Manager → Ports (COM & LPT) → look for "Unicorn"
"""

import argparse
import asyncio
import json
import subprocess
import sys

import numpy as np
import websockets

WS_PORT   = 4514
UPDATE_HZ = 10
WINDOW_S  = 2
SRATE     = 250   # Unicorn Hybrid Black fixed sample rate
N_CH      = 8     # EEG channels: Fz C3 Cz C4 Pz PO7 Oz PO8


# ── Signal processing ─────────────────────────────────────────────────────────

def band_power(data: np.ndarray, srate: float, lo: float, hi: float) -> float:
    n     = data.shape[0]
    freqs = np.fft.rfftfreq(n, d=1.0 / srate)
    fft   = np.abs(np.fft.rfft(data)) ** 2
    mask  = (freqs >= lo) & (freqs <= hi)
    return float(np.mean(fft[mask])) if mask.any() else 0.0


def compute_load(buf: np.ndarray) -> float:
    """(theta + beta) / alpha across channels → 0–100 cognitive load score."""
    if buf.shape[0] < int(SRATE):
        return 30.0
    ratios = []
    for ch in range(buf.shape[1]):
        d     = buf[:, ch] - buf[:, ch].mean()
        alpha = band_power(d, SRATE,  8.0, 13.0)
        theta = band_power(d, SRATE,  4.0,  8.0)
        beta  = band_power(d, SRATE, 13.0, 30.0)
        ratios.append((theta + beta) / max(alpha, 1e-9))
    return round(float(np.clip((float(np.mean(ratios)) - 0.5) / 4.0 * 80 + 10, 0, 100)), 1)


# ── WebSocket handler ─────────────────────────────────────────────────────────

async def handle_client(websocket, serial_port: str):
    try:
        from brainflow.board_shim import BoardShim, BrainFlowInputParams, BoardIds
        from brainflow.data_filter import DataFilter
    except ImportError:
        msg = "brainflow not installed. Run: pip install brainflow"
        print(msg)
        await websocket.send(json.dumps({"status": "error", "error": msg}))
        return

    try:
        await websocket.send(json.dumps({"status": "searching"}))
    except Exception:
        return

    print("Browser connected — initialising Unicorn Hybrid Black via BrainFlow…")

    params = BrainFlowInputParams()
    params.serial_port = serial_port
    board = BoardShim(BoardIds.UNICORN_BOARD, params)

    try:
        BoardShim.disable_board_logger()
        board.prepare_session()
        board.start_stream(45000)
    except Exception as e:
        msg = f"Could not connect to Unicorn: {e}"
        print(msg)
        print("Check that:")
        print("  • The Unicorn is powered on and Bluetooth-paired")
        print("  • The serial port is correct (run: ls /dev/tty.UN-*  on Mac)")
        print("  • No other app (Unicorn Suite) is using the device")
        try:
            await websocket.send(json.dumps({"status": "error", "error": msg}))
        except Exception:
            pass
        return

    eeg_channels = BoardShim.get_eeg_channels(BoardIds.UNICORN_BOARD)
    win = int(SRATE * WINDOW_S)
    buf = np.zeros((win, N_CH))

    print(f"Unicorn Hybrid Black connected · {N_CH} ch · {SRATE} Hz")
    try:
        await websocket.send(json.dumps({
            "status":   "connected",
            "device":   "unicorn",
            "name":     "Unicorn Hybrid Black",
            "channels": N_CH,
            "srate":    SRATE,
            "host":     "localhost",
        }))
    except Exception:
        board.stop_stream()
        board.release_session()
        return

    interval = 1.0 / UPDATE_HZ
    try:
        while True:
            await asyncio.sleep(interval)
            data = board.get_current_board_data(int(SRATE / UPDATE_HZ * 2))
            if data.shape[1] > 0:
                chunk = data[eeg_channels, :].T  # (samples, channels)
                buf   = np.roll(buf, -len(chunk), axis=0)
                buf[-len(chunk):] = chunk[:, :N_CH]
            load = compute_load(buf)
            await websocket.send(json.dumps({
                "eegLoad":  load,
                "channels": buf[-1].tolist(),
            }))
    except websockets.exceptions.ConnectionClosed:
        print("Client disconnected")
    except Exception as e:
        print(f"Bridge error: {e}")
    finally:
        try:
            board.stop_stream()
            board.release_session()
        except Exception:
            pass
        print("Session ended — ready for next connection")


async def serve(serial_port: str):
    handler = lambda ws: handle_client(ws, serial_port)
    async with websockets.serve(handler, "localhost", WS_PORT):
        print(f"Listening on ws://localhost:{WS_PORT}  (waiting for browser…)\n")
        await asyncio.Future()


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="FrictionFix BrainFlow→WebSocket bridge (Unicorn Hybrid Black)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Find your serial port:
  Mac/Linux:  ls /dev/tty.UN-*   or   ls /dev/rfcomm*
  Windows:    Device Manager → Ports (COM & LPT)
""",
    )
    parser.add_argument(
        "--serial",
        metavar="PORT",
        required=True,
        help="Serial port of the Unicorn (e.g. /dev/tty.UN-000000000000-SerialPort or COM3)",
    )
    args = parser.parse_args()

    print("=" * 54)
    print("  FrictionFix EEG bridge   BrainFlow → WebSocket")
    print("  g.tec Unicorn Hybrid Black")
    print("=" * 54)
    print()
    print(f"Serial port: {args.serial}")
    print()
    print("Make sure:")
    print("  1. Unicorn is powered on")
    print("  2. Paired via Bluetooth on this computer")
    print("  3. Unicorn Suite is NOT open (it locks the port)")
    print()

    # Free port 4514 if a previous bridge is still holding it
    subprocess.run(["bash", "-c", f"lsof -ti :{WS_PORT} | xargs kill -9 2>/dev/null"], check=False)

    asyncio.run(serve(args.serial))
