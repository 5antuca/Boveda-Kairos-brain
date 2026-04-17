#!/usr/bin/env python3
import json
import sys
import os
from datetime import datetime

event = json.loads(sys.stdin.read())

op_type = event.get("type")
if op_type not in ["prompt", "read", "write", "bash"]:
    sys.exit(0)

bundle_dir = "agents/context_bundles"
os.makedirs(bundle_dir, exist_ok=True)

date_prefix = datetime.now().strftime("SAT_%d")
existing = [f for f in os.listdir(bundle_dir) if f.startswith(date_prefix)]
if existing:
    bundle_file = f"{bundle_dir}/{existing[0]}"
else:
    bundle_file = f"{bundle_dir}/{date_prefix}_{os.urandom(8).hex()}.jsonl"

operation = {"operation": op_type}
if op_type == "prompt":
    operation["prompt"] = event.get("prompt", "")
elif op_type in ["read", "write"]:
    operation["file_path"] = event.get("file_path", "")
    if op_type == "write":
        operation["tool_input"] = event.get("content", "")[:200]
elif op_type == "bash":
    operation["command"] = event.get("command", "")

with open(bundle_file, "a") as f:
    f.write(json.dumps(operation) + "\n")
