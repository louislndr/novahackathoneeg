#!/usr/bin/env python3
"""
FrictionFix — ANT Neuro eego WebSocket bridge (LSL → WebSocket)

Auto-discovers the eego machine on the local network — no IP config needed.
Works whether the eego machine is this computer or a separate one over WiFi/LAN.

    python3 bridge.py

If you want to skip the auto-scan and specify the IP directly:
    python3 bridge.py --eeg-host 192.168.1.42

Setup (one-time):
    pip install pylsl websockets numpy

Run each session:
    1. Open ANT Neuro eego software and start a recording
    2. Enable LSL in eego: Extras → LSL → Start
    3. python3 bridge.py
"""

import argparse
import asyncio
import concurrent.futures
import ipaddress
import json
import os
import socket
import tempfile

import numpy as np
import websockets

WS_PORT   = 4514
UPDATE_HZ = 10
WINDOW_S  = 2
LSL_PORT  = 16571   # default LSL TCP port


# ── Signal processing ─────────────────────────────────────────────────────────

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
        d     = buf[:, ch] - buf[:, ch].mean()
        alpha = band_power(d, srate,  8.0, 13.0)
        theta = band_power(d, srate,  4.0,  8.0)
        beta  = band_power(d, srate, 13.0, 30.0)
        ratios.append((theta + beta) / max(alpha, 1e-9))
    return round(float(np.clip((float(np.mean(ratios)) - 0.5) / 4.0 * 80 + 10, 0, 100)), 1)


# ── Network discovery ─────────────────────────────────────────────────────────

def get_outbound_ip() -> str | None:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return None


def _probe(host: str) -> str | None:
    try:
        with socket.create_connection((host, LSL_PORT), timeout=0.4):
            return host
    except Exception:
        return None


def scan_subnet(local_ip: str) -> list[str]:
    """TCP-scan the /24 subnet for hosts with the LSL port open (~1–2 s)."""
    try:
        net = ipaddress.IPv4Network(f"{local_ip}/24", strict=False)
    except Exception:
        return []
    hosts = [str(h) for h in net.hosts() if str(h) != local_ip]
    print(f"Scanning {len(hosts)} hosts on {net} for LSL port {LSL_PORT}…")
    found = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=100) as pool:
        for host, ok in zip(hosts, pool.map(_probe, hosts)):
            if ok:
                found.append(host)
                print(f"  → LSL host found: {host}")
    return found


def configure_unicast(peers: list[str]) -> str:
    """Write a temp lsl_api.cfg with KnownPeers. Must be called before pylsl import."""
    peer_str = ", ".join(f"{{{p}}}" for p in peers)
    cfg  = f"[lab]\nKnownPeers = {peer_str}\nSessionID = frictionfix\n"
    path = os.path.join(tempfile.mkdtemp(prefix="frictionfix_lsl_"), "lsl_api.cfg")
    with open(path, "w") as f:
        f.write(cfg)
    os.environ["LSLLIB_CONFIGURATION_FILE"] = path
    return path


def prepare_discovery(explicit: list[str] | None) -> None:
    """
    Configure LSL unicast peers before pylsl is imported.
    - Explicit hosts → use them directly.
    - Otherwise → scan /24 subnet; configure unicast if any LSL hosts found.
      (WiFi APs block UDP multicast so multicast-only fails on most networks.)
    """
    if explicit:
        path = configure_unicast(explicit)
        print(f"Unicast mode → {', '.join(explicit)}")
        print(f"Config: {path}")
        return

    local_ip = get_outbound_ip()
    if not local_ip:
        print("Could not determine local IP — will rely on LSL multicast.")
        return

    print(f"Local IP: {local_ip}")
    peers = scan_subnet(local_ip)
    if peers:
        path = configure_unicast(peers)
        print(f"Unicast config: {path}")
    else:
        print("No remote LSL hosts found — trying multicast (same machine or multicast LAN).")


# ── WebSocket handler ─────────────────────────────────────────────────────────

async def handle_client(websocket):
    # Import after LSLLIB_CONFIGURATION_FILE is set — pylsl reads config on first import
    from pylsl import StreamInlet, resolve_byprop, LostError

    print("Browser connected — resolving LSL EEG stream…")
    streams = resolve_byprop('type', 'EEG', timeout=20)
    if not streams:
        msg = ("No LSL EEG stream found. "
               "Make sure eego is recording and LSL is started (Extras → LSL → Start).")
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

    print(f"Stream: {info.name()} · {n_ch} ch · {srate} Hz · host: {info.hostname()}")
    try:
        await websocket.send(json.dumps({
            "status":   "stream_found",
            "name":     info.name(),
            "channels": n_ch,
            "srate":    srate,
            "host":     info.hostname(),
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
            load = compute_load(buf, srate)
            await websocket.send(json.dumps({
                "eegLoad":  load,
                "channels": buf[-1].tolist(),
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
        print(f"Listening on ws://localhost:{WS_PORT}  (waiting for browser…)\n")
        await asyncio.Future()


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="FrictionFix LSL→WebSocket bridge (ANT Neuro eego)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
By default the bridge auto-discovers the eego machine on your local network.
Use --eeg-host only to skip the scan and connect directly to a known IP.
""",
    )
    parser.add_argument(
        "--eeg-host",
        metavar="IP[,IP...]",
        help="Skip auto-discovery and connect directly to this IP.",
    )
    args = parser.parse_args()

    print("=" * 54)
    print("  FrictionFix EEG bridge   LSL → WebSocket")
    print("  ANT Neuro eego™")
    print("=" * 54)
    print()
    print("Before connecting:")
    print("  1. Open ANT Neuro eego software")
    print("  2. Start a recording session")
    print("  3. Enable LSL: Extras → LSL → Start")
    print()

    explicit = [h.strip() for h in args.eeg_host.split(",")] if args.eeg_host else None
    prepare_discovery(explicit)  # must run before any pylsl import

    print()
    asyncio.run(serve())
