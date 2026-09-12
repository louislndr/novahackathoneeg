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

def get_all_local_ips() -> list[str]:
    """Return all non-loopback IPv4 addresses on this machine."""
    ips = set()
    try:
        # Ask for every address this hostname resolves to
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith('127.'):
                ips.add(ip)
    except Exception:
        pass
    # Also get the outbound interface IP
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ips.add(s.getsockname()[0])
        s.close()
    except Exception:
        pass
    return list(ips)


def _ping(host: str) -> str | None:
    """Return host if it responds to ICMP ping, else None."""
    import subprocess
    try:
        r = subprocess.run(
            ['ping', '-c', '1', '-W', '500', '-t', '1', host],
            capture_output=True, timeout=1.5,
        )
        return host if r.returncode == 0 else None
    except Exception:
        return None


def ping_sweep(local_ips: list[str]) -> list[str]:
    """
    Ping every host on all local /24 subnets in parallel.
    Returns all live hosts — these become LSL KnownPeers so unicast
    discovery works even when WiFi blocks multicast.
    LSL uses UDP (not TCP) for discovery so TCP port scans never work.
    """
    seen_nets: set[str] = set()
    all_hosts: list[str] = []
    local_set = set(local_ips)
    for ip in local_ips:
        try:
            net = ipaddress.IPv4Network(f"{ip}/24", strict=False)
            key = str(net)
            if key in seen_nets:
                continue
            seen_nets.add(key)
            all_hosts += [str(h) for h in net.hosts() if str(h) not in local_set]
        except Exception:
            pass
    if not all_hosts:
        return []
    print(f"Pinging {len(all_hosts)} hosts on {', '.join(seen_nets)} to find live machines…")
    alive = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=150) as pool:
        for host, result in zip(all_hosts, pool.map(_ping, all_hosts)):
            if result:
                alive.append(result)
                print(f"  → live host: {host}")
    return alive


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

    local_ips = get_all_local_ips()
    if not local_ips:
        print("Could not determine local IP — will rely on LSL multicast.")
        return

    print(f"Local IPs: {', '.join(local_ips)}")
    peers = ping_sweep(local_ips)
    if peers:
        # Set ALL live hosts as KnownPeers — LSL will probe each via UDP and
        # find the one running eego without needing to know which one it is.
        path = configure_unicast(peers)
        print(f"Set {len(peers)} live hosts as LSL KnownPeers (unicast config: {path})")
    else:
        print("No live hosts found on subnet.")
        print("Falling back to LSL multicast — works if eego is on the same machine.")
        print()
        print("If eego is on a Windows machine, run instead:")
        print("  python3 bridge.py --eeg-host <windows-machine-ip>")


# ── WebSocket handler ─────────────────────────────────────────────────────────

async def handle_client(websocket):
    # Import after LSLLIB_CONFIGURATION_FILE is set — pylsl reads config on first import
    from pylsl import StreamInlet, resolve_byprop

    # Tell the browser we're searching — WebSocket open ≠ stream found
    try:
        await websocket.send(json.dumps({"status": "searching"}))
    except Exception:
        return

    print("Browser connected — resolving LSL EEG stream…")
    streams = resolve_byprop('type', 'EEG', timeout=20)
    if not streams:
        msg = ("No LSL EEG stream found. "
               "Make sure eego is recording and LSL is started (Extras → LSL → Start).")
        print(msg)
        try:
            await websocket.send(json.dumps({"status": "error", "error": msg}))
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
            "status":   "connected",
            "device":   "eego",
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
    except websockets.exceptions.ConnectionClosed:
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

    # Free port 4514 if a previous bridge is still holding it
    import subprocess
    subprocess.run(["bash", "-c", f"lsof -ti :{WS_PORT} | xargs kill -9 2>/dev/null"], check=False)

    explicit = [h.strip() for h in args.eeg_host.split(",")] if args.eeg_host else None
    prepare_discovery(explicit)  # must run before any pylsl import

    print()
    asyncio.run(serve())
