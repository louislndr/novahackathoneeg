"""Team: TO FILL | Members: TO FILL. ANT file replay and optional live LSL bridge.

LSL support requires the hardware vendor's acquisition software to expose an EEG
stream. This is not an ANT hardware driver. Confirm SDK/LSL access with mentors.
"""

import argparse
import json
from pathlib import Path
import time
import httpx
import numpy as np


def open_ant(path, channels=None):
    import mne
    raw = mne.io.read_raw_ant(Path(path), preload=False, verbose="ERROR")
    if channels:
        missing = set(channels) - set(raw.ch_names)
        if missing:
            raise ValueError(f"Recording missing channels: {sorted(missing)}")
        raw.pick(channels)
        raw.reorder_channels(channels)
    return raw


def post(client, path, payload):
    response = client.post(path, json=payload)
    if response.is_error:
        raise ValueError(f"Backend rejected {path}: {response.text}")
    return response.json()


def inspect(path):
    raw = open_ant(path)
    return {"file": Path(path).name, "sample_rate": raw.info["sfreq"],
            "channel_count": len(raw.ch_names), "channel_names": raw.ch_names,
            "duration_seconds": raw.n_times / raw.info["sfreq"]}


def replay(args):
    with httpx.Client(base_url=args.url, timeout=15, trust_env=False) as client:
        response = client.get(f"/sessions/{args.session}")
        response.raise_for_status()
        config = response.json()["config"]
        if config["source"] != "replay":
            raise ValueError("Create a source='replay' session first")
        raw = open_ant(args.file, config["channel_names"])
        sfreq = float(raw.info["sfreq"])
        if sfreq != config["sample_rate"]:
            raise ValueError(f"Recording is {sfreq} Hz; create session with the matching rate")
        first = int(args.start_seconds * sfreq)
        last = min(raw.n_times, first + int(args.seconds * sfreq)) if args.seconds else raw.n_times
        if first < 0 or first >= last:
            raise ValueError("No samples in requested interval")
        chunk_size = int(sfreq / 2)
        wall_start = time.monotonic()
        for seq, start in enumerate(range(first, last, chunk_size)):
            stop = min(start + chunk_size, last)
            # Pace at original speed; replay is never presented as live participant EEG.
            wait = (stop - first) / sfreq - (time.monotonic() - wall_start)
            if wait > 0:
                time.sleep(wait)
            samples = raw.get_data(start=start, stop=stop).T  # MNE returns volts.
            state = post(client, f"/sessions/{args.session}/eeg", {
                "sequence": seq, "source": "replay", "units": "V",
                "samples": samples.tolist(), "start_time": start / sfreq,
            })
            if seq % 4 == 3:
                print(json.dumps({"source": "replay", "quality": state["eeg"]["quality"],
                                  "risk_score": state["eeg"]["risk_score"]}), flush=True)


def lsl(args):
    from pylsl import resolve_byprop, StreamInlet, local_clock
    matches = resolve_byprop("name", args.stream_name, timeout=5)
    if len(matches) != 1:
        raise ValueError(f"Expected exactly one stream named {args.stream_name!r}; found {len(matches)}")
    inlet = StreamInlet(matches[0], max_buflen=5)
    info = inlet.info(timeout=5)
    desc = info.desc().child("channels").child("channel")
    labels = []
    for _ in range(info.channel_count()):
        labels.append(desc.child_value("label"))
        desc = desc.next_sibling()
    with httpx.Client(base_url=args.url, timeout=10, trust_env=False) as client:
        response = client.get(f"/sessions/{args.session}")
        response.raise_for_status()
        config = response.json()["config"]
        if config["source"] != "live":
            raise ValueError("Create a source='live' session first")
        if info.nominal_srate() != config["sample_rate"]:
            raise ValueError("LSL sample rate differs from the session configuration")
        if not all(name in labels and labels.count(name) == 1 for name in config["channel_names"]):
            raise ValueError(f"LSL channel labels unavailable/ambiguous: {labels}. Ask the vendor to supply metadata.")
        indices = [labels.index(name) for name in config["channel_names"]]
        seq = 0
        try:
            while True:
                samples, stamps = inlet.pull_chunk(timeout=1, max_samples=int(config["sample_rate"] / 2))
                if not stamps:
                    continue
                correction = inlet.time_correction(timeout=2)
                age = local_clock() - (stamps[-1] + correction)
                if age > 2 or age < -0.5:
                    print("Discarding stale or unsynchronized LSL chunk", flush=True)
                    seq += 1
                    continue
                # Reject within-chunk dropouts too; do not assume sample continuity.
                if len(stamps) > 1 and np.any(np.abs(np.diff(stamps) - 1 / config["sample_rate"]) > 1.5 / config["sample_rate"]):
                    print("Discarding discontinuous LSL chunk", flush=True)
                    seq += 1
                    continue
                data = np.asarray(samples)[:, indices]
                state = post(client, f"/sessions/{args.session}/eeg", {
                    "sequence": seq, "source": "live", "units": args.units,
                    "samples": data.tolist(), "start_time": stamps[0],
                })
                seq += 1
                if state["phase"] in {"completed", "abandoned"}:
                    return
        finally:
            inlet.close_stream()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    inspect_parser = sub.add_parser("inspect")
    inspect_parser.add_argument("file")
    replay_parser = sub.add_parser("replay")
    replay_parser.add_argument("file")
    replay_parser.add_argument("--start-seconds", type=float, default=0)
    replay_parser.add_argument("--seconds", type=float)
    live_parser = sub.add_parser("lsl")
    live_parser.add_argument("--stream-name", required=True)
    live_parser.add_argument("--units", choices=["V", "uV"], required=True,
                             help="Confirm source units with the vendor; do not guess")
    for p in (replay_parser, live_parser):
        p.add_argument("--session", required=True)
        p.add_argument("--url", default="http://127.0.0.1:8000")
    args = parser.parse_args()
    try:
        if args.command == "inspect":
            print(json.dumps(inspect(args.file), indent=2))
        elif args.command == "replay":
            replay(args)
        else:
            lsl(args)
    except (ValueError, OSError, ImportError, httpx.HTTPError) as exc:
        parser.exit(1, f"{exc}\n")


if __name__ == "__main__":
    main()
