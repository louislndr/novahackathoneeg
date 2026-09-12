"""Optional real-network smoke test with SYNTHETIC LSL, plus optional recorded replay.

This proves local transport, not cap acquisition. Run after installing .[eeg,test].
The temporary server/database and synthetic outlet are cleaned up after the check.
"""

import argparse
import json
import math
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import time
from uuid import uuid4
import httpx
import uvicorn
from frictionfix.app import create_app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--replay-file")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as temp:
        sock = socket.socket()
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
        url = f"http://127.0.0.1:{port}"
        app = create_app(Path(temp) / "test.sqlite3")
        server = uvicorn.Server(uvicorn.Config(app, log_level="error", access_log=False))
        thread = threading.Thread(target=server.run, kwargs={"sockets": [sock]}, daemon=True)
        thread.start()
        try:
            deadline = time.monotonic() + 5
            while not server.started:
                if time.monotonic() > deadline:
                    raise RuntimeError("Temporary API did not start")
                time.sleep(.05)
            with httpx.Client(base_url=url, timeout=15, trust_env=False) as client:
                if args.replay_file:
                    response = client.post("/sessions", json={
                        "participant_id": "recorded-pipeline-check", "website_url": "https://example.test",
                        "source": "replay", "policy": "observe"})
                    response.raise_for_status()
                    sid = response.json()["session_id"]
                    client.post(f"/sessions/{sid}/start").raise_for_status()
                    result = subprocess.run([
                        sys.executable, "-m", "frictionfix.bridge", "replay", args.replay_file,
                        "--session", sid, "--url", url, "--start-seconds", "30", "--seconds", "6",
                    ], capture_output=True, text=True, timeout=30)
                    if result.returncode:
                        raise RuntimeError(result.stderr)
                    state = client.get(f"/sessions/{sid}").json()
                    assert state["eeg"]["total_windows"] == 3
                    assert state["eeg"]["source"] == "replay"
                    print("PASS: actual recorded replay → HTTP → three EEG windows")
                check_lsl(client, url)
        finally:
            server.should_exit = True
            thread.join(timeout=5)
            sock.close()


def check_lsl(client, url):
    from pylsl import StreamInfo, StreamOutlet, local_clock
    name = "FrictionFixSyntheticTest-" + uuid4().hex[:8]
    response = client.post("/sessions", json={
        "participant_id": "synthetic-lsl-transport-check", "website_url": "https://example.test",
        "source": "live", "sample_rate": 128, "channel_names": ["F3", "F4"], "policy": "observe"})
    response.raise_for_status()
    sid = response.json()["session_id"]
    client.post(f"/sessions/{sid}/start").raise_for_status()
    info = StreamInfo(name, "EEG", 2, 128, "float32", name)
    channels = info.desc().append_child("channels")
    for label in ("F3", "F4"):
        channels.append_child("channel").append_child_value("label", label)
    outlet = StreamOutlet(info)
    process = subprocess.Popen([
        sys.executable, "-m", "frictionfix.bridge", "lsl", "--stream-name", name,
        "--units", "uV", "--session", sid, "--url", url,
    ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        start = time.monotonic()
        start_lsl = local_clock()
        for i in range(128 * 10):
            delay = start + i / 128 - time.monotonic()
            if delay > 0:
                time.sleep(delay)
            outlet.push_sample([
                12 * math.sin(2 * math.pi * 10 * i / 128),
                10 * math.sin(2 * math.pi * 10 * i / 128 + .2),
            ], start_lsl + i / 128)
        state = client.get(f"/sessions/{sid}").json()
        assert state["eeg"]["total_windows"] >= 2, json.dumps(state["eeg"])
        assert state["eeg"]["quality"] == "usable", json.dumps(state["eeg"])
        print("PASS: synthetic LSL outlet → Python bridge → HTTP → usable EEG features")
        print("Synthetic test only; no ANT cap was connected.")
    finally:
        process.terminate()
        stdout, stderr = process.communicate(timeout=5)
        if process.returncode not in (0, -15):
            print(stdout, stderr, file=sys.stderr)


if __name__ == "__main__":
    main()
