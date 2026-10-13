# Source from zsh build scripts. SwiftPM's native builder also works without full Xcode.
SELAH_SWIFT_ARGS=(--build-system native)
if [[ "$(xcode-select -p)" == /Library/Developer/CommandLineTools && -d /Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk ]]; then
    # The CLT 27 SDK declares SwiftUI macros whose plugin only ships with full Xcode.
    SELAH_SWIFT_ARGS+=(--sdk /Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk)
fi
