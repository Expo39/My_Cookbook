#!/bin/sh
# Turns the raw walkthrough recording into the files the how-to page serves: a VP9 WebM under 5 MB
# and a poster frame. The captions file is written by the walkthrough spec itself.
set -eu

raw=web/test-results/walkthrough/walkthrough.webm
out=web/static/video
limit=$((5 * 1024 * 1024))

[ -f "$raw" ] || { echo "no recording at $raw: run the walkthrough spec first" >&2; exit 1; }
mkdir -p "$out"

# Constant quality first; a second, smaller pass only if the file is still over the limit.
for crf in 42 50; do
	ffmpeg -loglevel error -y -i "$raw" -an -c:v libvpx-vp9 -b:v 0 -crf "$crf" -row-mt 1 \
		-deadline good -cpu-used 4 "$out/how-to-use.webm"
	size=$(wc -c < "$out/how-to-use.webm")
	[ "$size" -le "$limit" ] && break
done
[ "$size" -le "$limit" ] || { echo "the video is $size bytes, over the 5 MB limit" >&2; exit 1; }

ffmpeg -loglevel error -y -ss 2 -i "$raw" -frames:v 1 -q:v 3 "$out/how-to-use.jpg"
echo "wrote $out/how-to-use.webm ($size bytes), how-to-use.jpg and how-to-use.vtt"
