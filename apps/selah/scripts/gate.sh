#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
source scripts/toolchain.sh
swift format lint --strict --recursive Package.swift Sources Tests
swift build "${SELAH_SWIFT_ARGS[@]}" -Xswiftc -warnings-as-errors
SELAH_TEST_ARGS=()
if [[ "$(xcode-select -p)" == /Library/Developer/CommandLineTools ]]; then
    SELAH_TEST_FRAMEWORKS=/Library/Developer/CommandLineTools/Library/Developer/Frameworks
    SELAH_TEST_ARGS+=(-Xswiftc -F -Xswiftc "$SELAH_TEST_FRAMEWORKS"
        -Xswiftc -load-plugin-library -Xswiftc /Library/Developer/CommandLineTools/usr/lib/swift/host/plugins/testing/libTestingMacros.dylib
        -Xlinker -F -Xlinker "$SELAH_TEST_FRAMEWORKS" -Xlinker -rpath -Xlinker "$SELAH_TEST_FRAMEWORKS")
fi
swift test "${SELAH_SWIFT_ARGS[@]}" "${SELAH_TEST_ARGS[@]}" -Xswiftc -warnings-as-errors
python3 - <<'PY'
import json
from pathlib import Path
verses = json.loads(Path('Sources/SelahApp/Resources/kjv.json').read_text())
assert len(verses) == 31102
assert len({v['book'] for v in verses}) == 66
assert len({(v['book'], v['chapter'], v['number']) for v in verses}) == len(verses)
assert all(v['text'].strip() for v in verses)
print('KJV corpus: 66 books, 31,102 unique verses verified')
PY
