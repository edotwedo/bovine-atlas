# Bovine Atlas

Offline 3D bovine anatomy and butchery trainer for Android (Nothing Phone 3 target). Three.js r147 in a WebView, all assets bundled; no network permission.

- Rotate, pinch-zoom, two-finger pan; tap to identify.
- Layers: skin / fat / muscle / bone, each on, x-ray or off.
- Isolate any muscle or bone; structure index with search.
- Primals mode: US (IMPS/NAMP) primals painted on the carcass, tap for boundary rule and cuts.
- Cuts mode: 26 retail cuts mapped to their source muscles.
- Dissect mode: seam-separation slider, tap a muscle to lift it out, undo / reassemble.
- Every structure is labelled for fidelity: **Cited fact** (names, counts, mappings from references),
  **Proportional** (bones placed from landmarks), **Schematic** (muscle and fat volumes).

## Build

    ./build.sh            # aapt2 -> javac -> d8 -> zipalign -> apksigner, no Gradle
    VERSION_CODE=2 VERSION_NAME=0.2.0 ./build.sh

Needs `~/Android/Sdk` with build-tools 35.0.0 and platforms;android-35, JDK 21.
Release key: `~/.android/bovine-atlas-release.jks` (password file beside it, never commit either).

## Visual test hook

`index.html#mode=primals&skin=ghost&sel=biceps_femoris&cut=Tri-tip&explode=0.5&cam=x,y,z`, and
`#debug=2` reports any structure poking outside the hide.

## Next for accuracy

Replace schematic muscle volumes with meshes segmented from a reference specimen (CT or
photogrammetry of a dissected carcass) and have an anatomist or meat scientist review the facts.
