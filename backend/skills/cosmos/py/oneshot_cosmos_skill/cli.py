"""CLI entry point for the Cosmos skill."""
from __future__ import annotations

import argparse
import sys

from oneshot_cosmos_skill.rpc import main as rpc_main


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="oneshot-cosmos-skill")
    parser.add_argument(
        "command",
        choices=["rpc"],
        default="rpc",
        nargs="?",
        help="Run the JSON-RPC server.",
    )
    args = parser.parse_args(argv)
    if args.command == "rpc":
        return rpc_main()
    return 0


if __name__ == "__main__":
    sys.exit(main())
