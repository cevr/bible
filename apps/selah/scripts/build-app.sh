#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
source scripts/toolchain.sh
swift build "${SELAH_SWIFT_ARGS[@]}" -c release
SELAH_BIN_DIR=$(swift build "${SELAH_SWIFT_ARGS[@]}" -c release --show-bin-path)
SELAH_APP="$PWD/dist/Selah.app"
mkdir -p "$SELAH_APP/Contents/MacOS" "$SELAH_APP/Contents/Resources"
cp "$SELAH_BIN_DIR/Selah" "$SELAH_APP/Contents/MacOS/Selah"
for SELAH_RESOURCE in "$SELAH_BIN_DIR"/*.bundle; do
    cp -R "$SELAH_RESOURCE" "$SELAH_APP/Contents/Resources/"
done
cat > "$SELAH_APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>Selah</string>
<key>CFBundleIdentifier</key><string>com.cevr.selah</string>
<key>CFBundleName</key><string>Selah</string>
<key>CFBundleDisplayName</key><string>Selah</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSMinimumSystemVersion</key><string>26.0</string>
<key>LSUIElement</key><true/>
<key>NSMicrophoneUsageDescription</key><string>Dictate your Scripture recall when you choose Dictate.</string>
<key>NSSpeechRecognitionUsageDescription</key><string>Compare your spoken recall using on-device speech recognition.</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
codesign --force --deep --sign - "$SELAH_APP"
echo "Built $SELAH_APP"
