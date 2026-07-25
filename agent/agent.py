#!/usr/bin/env python3
"""
System state agent that collects packages, configs, environment variables, and services.
Sends collected data to an ingestion API endpoint.
"""

import argparse
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Optional

import requests
import yaml


# Denylist patterns for environment variable keys
ENV_DENYLIST_PATTERNS = [
    r"SECRET",
    r"TOKEN",
    r"PASSWORD",
    r"AWS_",
    r"GITHUB_",
    r"NPM_TOKEN",
    r"DOCKER_PASSWORD",
]

# Predefined config paths to collect
CONFIG_PATHS = [
    "/etc/bazzite/portal.yaml",
    "/etc/default/grub",
    "/etc/environment",
    str(Path.home() / ".bashrc"),
]


def collect_packages() -> list[dict[str, Any]]:
    """
    Collect installed packages from rpm and flatpak.
    Returns a list of record dicts with recordType 'PACKAGE'.
    """
    records = []

    # Collect RPM packages
    try:
        result = subprocess.run(
            ["rpm", "-qa"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            for line in result.stdout.strip().split("\n"):
                if line:
                    # Parse name-version-release.arch format
                    # Simplified: extract name and version
                    parts = line.split("-")
                    if len(parts) >= 2:
                        name = parts[0]
                        # Version is typically the rest minus release/arch
                        version = "-".join(parts[1:])
                    else:
                        name = line
                        version = "unknown"

                    records.append({
                        "recordType": "PACKAGE",
                        "id": name,
                        "data": {
                            "name": name,
                            "version": version,
                            "source": "rpm",
                        },
                    })
    except (subprocess.SubprocessError, FileNotFoundError):
        pass  # rpm not available on this system

    # Collect Flatpak packages
    try:
        result = subprocess.run(
            ["flatpak", "list"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            for line in result.stdout.strip().split("\n"):
                if line:
                    parts = line.split("\t")
                    if len(parts) >= 3:
                        name = parts[0]
                        version = parts[1] if len(parts) > 1 else "unknown"
                    else:
                        name = line.split()[0] if line.split() else line
                        version = "unknown"

                    records.append({
                        "recordType": "PACKAGE",
                        "id": name,
                        "data": {
                            "name": name,
                            "version": version,
                            "source": "flatpak",
                        },
                    })
    except (subprocess.SubprocessError, FileNotFoundError):
        pass  # flatpak not available on this system

    return records


def collect_configs() -> list[dict[str, Any]]:
    """
    Collect configuration files from predefined paths.
    Returns a list of record dicts with recordType 'CONFIG'.
    """
    records = []

    for config_path in CONFIG_PATHS:
        path = Path(config_path).expanduser()
        if not path.exists():
            continue

        try:
            raw_content = path.read_text()
            parsed = None

            # Try to parse YAML files
            if path.suffix.lower() in (".yaml", ".yml"):
                try:
                    parsed = yaml.safe_load(raw_content)
                except yaml.YAMLError:
                    parsed = None  # Store as raw if parsing fails

            records.append({
                "recordType": "CONFIG",
                "id": str(path),
                "data": {
                    "path": str(path),
                    "parsed": parsed,
                    "raw": raw_content,
                },
                "stalenessThresholdSeconds": 86400,
            })
        except (OSError, IOError) as e:
            # Skip files we can't read
            continue

    return records


def collect_env() -> list[dict[str, Any]]:
    """
    Collect environment variables, filtering out sensitive ones.
    Returns a list of record dicts with recordType 'ENV'.
    """
    records = []
    denylist_regex = re.compile("|".join(ENV_DENYLIST_PATTERNS), re.IGNORECASE)

    for key, value in os.environ.items():
        # Skip keys matching denylist patterns
        if denylist_regex.search(key):
            continue

        records.append({
            "recordType": "ENV",
            "id": key,
            "data": {
                "key": key,
                "value": value,
            },
            "stalenessThresholdSeconds": 3600,
        })

    return records


def collect_services() -> list[dict[str, Any]]:
    """
    Collect active systemd services.
    Returns a list of record dicts with recordType 'SERVICE'.
    """
    records = []

    try:
        result = subprocess.run(
            ["systemctl", "list-units", "--type=service", "--state=active", "--no-legend"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            for line in result.stdout.strip().split("\n"):
                if line:
                    # Format: UNIT LOAD ACTIVE SUB DESCRIPTION
                    parts = line.split()
                    if parts:
                        name = parts[0]
                        records.append({
                            "recordType": "SERVICE",
                            "id": name,
                            "data": {
                                "name": name,
                                "status": "active",
                            },
                            "stalenessThresholdSeconds": 300,
                        })
    except (subprocess.SubprocessError, FileNotFoundError):
        pass  # systemctl not available

    return records


def send_batch(
    api_url: str,
    device_id: str,
    records: list[dict[str, Any]],
    api_key: Optional[str] = None,
) -> bool:
    """
    Send a batch of records to the ingestion API.
    Returns True on success, False on failure.
    """
    payload = {
        "deviceId": device_id,
        "records": records,
    }

    headers = {"Content-Type": "application/json"}
    key = api_key or os.environ.get("INGEST_API_KEY") or os.environ.get("API_KEY")
    if key:
        headers["x-api-key"] = key

    try:
        response = requests.post(
            api_url,
            json=payload,
            headers=headers,
            timeout=30,
        )
        response.raise_for_status()
        print(f"Successfully sent {len(records)} records to {api_url}")
        return True
    except requests.exceptions.RequestException as e:
        print(f"Failed to send batch: {e}", file=sys.stderr)
        return False


def main() -> None:
    """Main entry point for the agent."""
    parser = argparse.ArgumentParser(
        description="System state agent that collects and reports local environment data."
    )
    parser.add_argument(
        "--device-id",
        required=True,
        help="Unique identifier for this device",
    )
    parser.add_argument(
        "--api-url",
        required=False,
        default=None,
        help="URL of the ingestion API endpoint (not required with --dry-run)",
    )
    parser.add_argument(
        "--api-key",
        required=False,
        default=None,
        help="API Gateway x-api-key (or set INGEST_API_KEY / API_KEY)",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=60,
        help="Collection interval in seconds (default: 60)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print collected records instead of sending to API",
    )

    args = parser.parse_args()

    # Validate arguments
    if not args.dry_run and not args.api_url:
        print("Error: --api-url is required unless --dry-run is specified", file=sys.stderr)
        sys.exit(1)

    print(f"Starting agent for device: {args.device_id}")
    if args.dry_run:
        print("Mode: DRY-RUN (will print records instead of sending)")
    else:
        print(f"API URL: {args.api_url}")
        print(f"Interval: {args.interval} seconds")

    while True:
        try:
            # Collect all records
            all_records = []

            print("Collecting packages...")
            all_records.extend(collect_packages())

            print("Collecting configs...")
            all_records.extend(collect_configs())

            print("Collecting environment variables...")
            all_records.extend(collect_env())

            print("Collecting services...")
            all_records.extend(collect_services())

            print(f"Collected {len(all_records)} total records")

            if args.dry_run:
                # Print collected records as JSON
                print("\n=== DRY-RUN OUTPUT ===")
                import json
                print(json.dumps({
                    "deviceId": args.device_id,
                    "records": all_records
                }, indent=2))
                print("=== END DRY-RUN ===\n")
            elif all_records:
                # Send batch to API
                send_batch(args.api_url, args.device_id, all_records, api_key=args.api_key)
            else:
                print("No records to send")

        except KeyboardInterrupt:
            print("\nAgent interrupted by user")
            break
        except Exception as e:
            print(f"Error during collection: {e}", file=sys.stderr)

        # If dry-run, exit after one iteration
        if args.dry_run:
            break

        # Wait for next interval
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
