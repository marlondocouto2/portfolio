"""Set a new asset version on every page, so visitors' browsers fetch the updated files.

    python scripts/bump_version.py            # uses today's date, e.g. 2026-11-11
    python scripts/bump_version.py 2026-11-11b

Run it whenever you change anything in site/assets/ or site/data/, before committing.
"""

from __future__ import annotations

import datetime as dt
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parents[1] / "site"


def main() -> None:
    version = sys.argv[1] if len(sys.argv) > 1 else dt.date.today().isoformat()
    for page in SITE.glob("*.html"):
        text = page.read_text()
        text = re.sub(r'(href|src)="(assets/[^"?]+\.(?:css|js))(\?v=[^"]*)?"', rf'\1="\2?v={version}"', text)
        page.write_text(text)
    common = SITE / "assets" / "common.js"
    common.write_text(re.sub(r'const ASSET_VERSION = "[^"]*";', f'const ASSET_VERSION = "{version}";',
                             common.read_text()))
    print(f"Asset version set to {version}")


if __name__ == "__main__":
    main()
