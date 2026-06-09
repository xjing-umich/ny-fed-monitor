from __future__ import annotations

import argparse
import json
import os
import sys

from .peers import set_peer_group
from .pipeline import run_for_ticker
from .prompts import ai_prompt_payload
from .schema import connect, initialize
from .sec_client import SecClient


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="SEC-first data expansion pipeline")
    parser.add_argument("--db", default="sec_data.db", help="SQLite database path")
    sub = parser.add_subparsers(dest="command", required=True)

    init = sub.add_parser("init-db", help="Create/update database schema")
    init.set_defaults(func=cmd_init)

    run = sub.add_parser("run", help="Run expansion pipeline for tickers")
    run.add_argument("tickers", nargs="+")
    run.add_argument("--user-agent", default=os.getenv("SEC_USER_AGENT"))
    run.add_argument("--skip-price", action="store_true")
    run.add_argument("--skip-filings", action="store_true")
    run.set_defaults(func=cmd_run)

    peers = sub.add_parser("set-peers", help="Set manual peer group")
    peers.add_argument("ticker")
    peers.add_argument("peers", nargs="+")
    peers.set_defaults(func=cmd_set_peers)

    payload = sub.add_parser("prompt-payload", help="Print AI-safe prompt payload")
    payload.add_argument("ticker")
    payload.set_defaults(func=cmd_prompt_payload)
    return parser


def cmd_init(args: argparse.Namespace) -> None:
    conn = connect(args.db)
    initialize(conn)
    print(f"Initialized {args.db}")


def cmd_run(args: argparse.Namespace) -> None:
    if not args.user_agent:
        raise SystemExit("Provide --user-agent or SEC_USER_AGENT, e.g. 'Your Name your@email.com'.")
    conn = connect(args.db)
    initialize(conn)
    client = SecClient(args.user_agent)
    results = [
        run_for_ticker(conn, client, ticker, include_price=not args.skip_price, include_filings=not args.skip_filings)
        for ticker in args.tickers
    ]
    print(json.dumps(results, indent=2, sort_keys=True))


def cmd_set_peers(args: argparse.Namespace) -> None:
    conn = connect(args.db)
    initialize(conn)
    set_peer_group(conn, args.ticker, args.peers)
    print(f"Stored peers for {args.ticker.upper()}: {', '.join(peer.upper() for peer in args.peers)}")


def cmd_prompt_payload(args: argparse.Namespace) -> None:
    conn = connect(args.db)
    print(json.dumps(ai_prompt_payload(conn, args.ticker), indent=2, sort_keys=True))


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
