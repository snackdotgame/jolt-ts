#!/usr/bin/env python3
from pathlib import Path
import sys


def main() -> int:
    if len(sys.argv) != 4:
        print("usage: replace_text.py <needle> <replacement> <file>", file=sys.stderr)
        return 2

    needle, replacement, file_name = sys.argv[1:]
    path = Path(file_name)
    text = path.read_text()
    path.write_text(text.replace(needle, replacement))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
