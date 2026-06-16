# Local system state collector that gathers package versions, configs, and service status
import subprocess
import json

def collect_state():
    """Collect local development environment state."""
    state = {
        "node_version": subprocess.check_output(["node", "--version"]).decode().strip(),
        "npm_version": subprocess.check_output(["npm", "--version"]).decode().strip(),
    }
    print(json.dumps(state, indent=2))
    return state

if __name__ == "__main__":
    collect_state()
