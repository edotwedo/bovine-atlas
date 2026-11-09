#!/usr/bin/env bash
# Builds a signed release APK without Gradle: aapt2 -> javac -> d8 -> zipalign -> apksigner.
set -euo pipefail
cd "$(dirname "$0")"
SDK=${ANDROID_HOME:-$HOME/Android/Sdk}; BT=$SDK/build-tools/35.0.0; AJ=$SDK/platforms/android-35/android.jar
VC=${VERSION_CODE:-1}; VN=${VERSION_NAME:-0.1.0}
KS=${KEYSTORE:-$HOME/.android/bovine-atlas-release.jks}; KP=${KEYSTORE_PASS_FILE:-$HOME/.android/bovine-atlas-release.pass}
rm -rf build && mkdir -p build/res build/gen build/classes build/dex dist
"$BT/aapt2" compile --dir app/res -o build/res/
"$BT/aapt2" link -o build/base.apk -I "$AJ" --manifest app/AndroidManifest.xml -R build/res/*.flat \
  -A app/assets --java build/gen --min-sdk-version 26 --target-sdk-version 35 \
  --version-code "$VC" --version-name "$VN" --auto-add-overlay
javac -nowarn -Xlint:none --release 11 -cp "$AJ" -d build/classes $(find app/src build/gen -name '*.java')
"$BT/d8" --release --min-api 26 --lib "$AJ" --output build/dex $(find build/classes -name '*.class')
cp build/base.apk build/unsigned.apk && (cd build/dex && zip -qj ../unsigned.apk classes.dex)
"$BT/zipalign" -f -p 4 build/unsigned.apk build/aligned.apk
"$BT/apksigner" sign --ks "$KS" --ks-pass "file:$KP" --out "dist/BovineAtlas-$VN.apk" build/aligned.apk
"$BT/apksigner" verify "dist/BovineAtlas-$VN.apk" && ls -l "dist/BovineAtlas-$VN.apk"
