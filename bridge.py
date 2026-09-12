#!/usr/bin/env python3
"""
FrictionFix — ANT Neuro EEG WebSocket bridge (LSL → WebSocket)

Works with eego on the same machine OR on a different machine over WiFi/LAN.
If the eego machine is separate, pass its IP address:

    python3 bridge.py --eeg-host 192.168.1.42

Without --eeg-host, LSL multicast discovery is used (works when both machines
are on the same subnet and the AP passes multicast — often blocked on WiFi).

Setup (one-time):
    pip install pylsl websockets numpy

Run each session:
    1. Open ANT Neuro eego software and start a recording
    2. Enable LSL in eego: Extras → LSL → Start
    3. python3 bridge.py [--eeg-host <IP of eego machine>]
"""

import argparse
import asyncio
import json
import os
import tempfile
import numpy as np
import websockets

WS_PORT     = 4514
UPDATE_HZ   = 10
WINDOW_S    = 2
LSL_TIMEOUT = 30   # longer for cross-machine discovery


def band_power(data: np.ndarray, srate: float, lo: float, hi: float) -> float:
    n     = data.shape[0]
    freqs = np.fft.rfftfreq(n, d=1.0 / srate)
    fft   = np.abs(np.fft.rfft(data)) ** 2
    mask  = (freqs >= lo) & (freqs <= hi)
    return float(np.mean(fft[mask])) if mask.any() else 0.0


def compute_load(buf: np.ndarray, srate: float) -> float:
    """(theta + beta) / alpha across channels → 0–100 cognitive load score."""
    if buf.shape[0] < int(srate):
        return 30.0
    ratios = []
    for ch in range(buf.shape[1]):
        ch_data = buf[:, ch] - buf[:, ch].mean()
        alpha   = band_power(ch_data, srate,  8.0, 13.0)
        theta   = band_power(ch_data, srate,  4.0,  8.0)
        beta    = band_power(ch_data, srate, 13.0, 30.0)
        ratios.append((theta + beta) / max(alpha, 1e-9))
    ratio = float(np.mean(ratios))
    return round(float(np.clip((ratio - 0.5) / 4.0 * 80 + 10, 0, 100)), 1)


async def handle_client(websocket):
    # Import inside the handler so LSLLIB_CONFIGURATION_FILE is already set
    from pylsl import StreamInlet, resolve_byprop, LostError

    print("Browser connected — searching for LSL EEG stream…")
    streams = resolve_byprop('type', 'EEG', timeout=LSL_TIMEOUT)
    if not streams:
        msg = "No LSL EEG stream found. Ensure eego LSL is started (Extras → LSL → Start)."
        print(msg)
        try:
            await websocket.send(json.dumps({"error": msg}))
        except Exception:
            pass
        await websocket.close()
        return

    inlet  = StreamInlet(streams[0])
    info   = inlet.info()
    srate  = info.nominal_srate() or 256.0
    n_ch   = info.channel_count()
    win    = int(srate * WINDOW_S)
    buf    = np.zeros((win, n_ch))

    print(f"LSL stream: {info.name()} · {n_ch} ch · {srate} Hz · host: {info.hostname()}")
    try:
        await websocket.send(json.dumps({
            "status": "stream_found",
            "name": info.name(),
            "channels": n_ch,
            "srate": srate,
            "host": info.hostname(),
        }))
    except Exception:
        return

    interval = 1.0 / UPDATE_HZ
    try:
        while True:
            await asyncio.sleep(interval)
            samples, _ = inlet.pull_chunk(timeout=0.0, max_samples=int(srate))
            if samples:
                chunk = np.array(samples)
                buf   = np.roll(buf, -len(chunk), axis=0)
                buf[-len(chunk):] = chunk[:, :n_ch]

            load     = compute_load(buf, srate)
            channels = buf[-1].tolist()

            await websocket.send(json.dumps({
                "eegLoad":  load,
                "channels": channels,
            }))

    except (websockets.exceptions.ConnectionClosed, LostError):
        print("Client disconnected")
    except Exception as e:
        print(f"Bridge error: {e}")
    finally:
        inlet.close_stream()
        print("Session ended — ready for next connection")


async def serve():
    async with websockets.serve(handle_client, "localhost", WS_PORT):
        print(f"Listening on ws://localhost:{WS_PORT}  (waiting for browser…)")
        await asyncio.Future()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="FrictionFix LSL→WebSocket bridge",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  Same machine as eego:
    python3 bridge.py

  eego running on a different computer (wireless or wired):
    python3 bridge.py --eeg-host 192.168.1.42

  Multiple peers (e.g. two amplifiers):
    python3 bridge.py --eeg-host 192.168.1.42,192.168.1.43
""",
    )
    parser.add_argument(
        "--eeg-host",
        metavar="IP[,IP...]",
        help="IP address(es) of the machine running eego. "
             "Required when WiFi/LAN blocks LSL multicast discovery.",
    )
    args = parser.parse_args()

    if args.eeg_host:
        # LSL uses UDP multicast for auto-discovery, which most WiFi APs block.
        # Writing an lsl_api.cfg with KnownPeers switches to unicast so discovery
        # works across machines on any network topology.
        peers = ", ".join(f"{{{ip.strip()}}}" for ip in args.eeg_host.split(","))
        cfg   = f"[lab]\nKnownPeers = {peers}\nSessionID = frictionfix\n"
        tmp   = tempfile.mkdtemp(prefix="frictionfix_lsl_")
        path  = os.path.join(tmp, "lsl_api.cfg")
        with open(path, "w") as f:
            f.write(cfg)
        os.environ["LSLLIB_CONFIGURATION_FILE"] = path
        print(f"LSL unicast mode → {args.eeg_host}")
        print(f"Config: {path}")
    else:
        print("LSL multicast discovery (same machine or multicast-capable network)")

    print("=" * 52)
    print(" FrictionFix EEG bridge   LSL → WebSocket")
    print("=" * 52)
    print()
    asyncio.run(serve())
