#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
source scripts/toolchain.sh
swift test "${SELAH_SWIFT_ARGS[@]}" "${SELAH_TEST_ARGS[@]}" -Xswiftc -warnings-as-errors
python3 - <<'PY'
import json
from pathlib import Path
verses = json.loads(Path('Sources/SelahApp/Resources/kjv.json').read_text())
assert len(verses) == 31102
assert len({v['book'] for v in verses}) == 66
assert len({(v['book'], v['chapter'], v['number']) for v in verses}) == len(verses)
assert all(v['text'].strip() for v in verses)
assert sum(len(v.get('marginNotes', [])) for v in verses) == 7320
print('KJV corpus: 66 books, 31,102 unique verses and 7,320 margin notes verified')
PY
