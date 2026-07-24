#!/usr/bin/env bash
# Spike test: run the capture helper, push real audio through the system output
# (via `say`), then stop it and report on the two WAV files.
set -uo pipefail
cd "$(dirname "$0")"

OUTDIR="${1:-/tmp/za3tar-spike}"
rm -rf "$OUTDIR"; mkdir -p "$OUTDIR"
LOG="$OUTDIR/helper.log"

echo "== starting helpers (one per track — AEC and the system tap can't share a process) =="
./za3tar-capture "$OUTDIR" --only=system >"$LOG" 2>&1 &
HELPER=$!
./za3tar-capture "$OUTDIR" --only=mic >"$LOG.mic" 2>&1 &
HELPER_MIC=$!

# give it a moment to create the tap + mic
sleep 2

echo "== playing test speech through system output =="
say -r 180 "Testing za3tar capture. Marhaba, this is the system audio track. One two three four five." || echo "(say failed)"
sleep 1

echo "== stopping helper =="
kill -INT "$HELPER" "$HELPER_MIC" 2>/dev/null
wait "$HELPER" 2>/dev/null
wait "$HELPER_MIC" 2>/dev/null
echo "helpers stopped"

echo "== helper logs =="
cat "$LOG" "$LOG.mic" 2>/dev/null

echo "== files =="
ls -la "$OUTDIR"/*.wav 2>/dev/null || echo "(no wav files)"
for f in system mic; do
  W="$OUTDIR/$f.wav"
  if [ -f "$W" ]; then
    echo "-- $f.wav --"
    afinfo "$W" 2>/dev/null | grep -Ei 'file type|data format|duration|audio bytes' | sed 's/^/   /'
  fi
done
