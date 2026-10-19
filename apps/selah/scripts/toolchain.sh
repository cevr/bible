# Source from zsh build scripts. SwiftPM's native builder also works without full Xcode.
SELAH_SWIFT_ARGS=(--build-system native)
if [[ "$(xcode-select -p)" == /Library/Developer/CommandLineTools && -d /Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk ]]; then
    # The CLT 27 SDK declares SwiftUI macros whose plugin only ships with full Xcode.
    SELAH_SWIFT_ARGS+=(--sdk /Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk)
fi
# The Command Line Tools keep Swift Testing outside the default search paths. Every debug
# build takes these flags, not only the tests': SwiftPM rebuilds every target when its flags
# change, so a build and a test run with different flags each rebuild the other's.
SELAH_TEST_ARGS=()
if [[ "$(xcode-select -p)" == /Library/Developer/CommandLineTools ]]; then
    SELAH_TEST_FRAMEWORKS=/Library/Developer/CommandLineTools/Library/Developer/Frameworks
    SELAH_TEST_ARGS+=(-Xswiftc -F -Xswiftc "$SELAH_TEST_FRAMEWORKS"
        -Xswiftc -load-plugin-library -Xswiftc /Library/Developer/CommandLineTools/usr/lib/swift/host/plugins/testing/libTestingMacros.dylib
        -Xlinker -F -Xlinker "$SELAH_TEST_FRAMEWORKS" -Xlinker -rpath -Xlinker "$SELAH_TEST_FRAMEWORKS")
fi
# The debug build's flags, warnings as errors: compile.sh's `swift build` and test.sh's
# `swift test` both read this one list, so neither rebuilds what the other built.
SELAH_DEBUG_ARGS=("${SELAH_SWIFT_ARGS[@]}" "${SELAH_TEST_ARGS[@]}" -Xswiftc -warnings-as-errors)
