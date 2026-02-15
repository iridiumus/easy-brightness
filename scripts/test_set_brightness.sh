#!/bin/bash
# Test script: set brightness on a monitor with verification loop
# Usage: ./test_set_brightness.sh <bus_number> <target_brightness>
# Example: ./test_set_brightness.sh 15 50

BUS="$1"
TARGET="$2"
MAX_RETRIES=5
RETRY_DELAY=2 # seconds between retries

if [ -z "$BUS" ] || [ -z "$TARGET" ]; then
	echo "Usage: $0 <bus_number> <target_brightness>"
	echo "Example: $0 15 50"
	exit 1
fi

read_brightness() {
	local bus="$1"
	local result
	result=$(ddcutil --bus "$bus" getvcp 10 2>&1)
	if [[ "$result" =~ current\ value\ =\ +([0-9]+) ]]; then
		echo "${BASH_REMATCH[1]}"
	else
		echo "-1"
	fi
}

set_brightness() {
	local bus="$1"
	local value="$2"
	ddcutil --bus "$bus" setvcp 10 "$value" 2>&1
}

echo "=== Setting brightness on bus $BUS to $TARGET% ==="

for ((attempt = 1; attempt <= MAX_RETRIES; attempt++)); do
	# Read current brightness
	current=$(read_brightness "$BUS")
	echo "  Attempt $attempt: current brightness = $current%"

	if [ "$current" -eq "$TARGET" ]; then
		echo "  OK: brightness is at target ($TARGET%)"
		exit 0
	fi

	if [ "$current" -eq -1 ]; then
		echo "  ERROR: failed to read brightness"
		sleep "$RETRY_DELAY"
		continue
	fi

	# Set brightness
	echo "  Setting brightness to $TARGET%..."
	set_brightness "$BUS" "$TARGET"

	# Wait for monitor to process
	sleep "$RETRY_DELAY"

	# Verify
	actual=$(read_brightness "$BUS")
	echo "  After set: brightness = $actual%"

	if [ "$actual" -eq "$TARGET" ]; then
		echo "  OK: brightness successfully set to $TARGET%"
		exit 0
	else
		echo "  MISMATCH: expected $TARGET%, got $actual%. Retrying..."
	fi
done

echo "  FAILED: could not set brightness to $TARGET% after $MAX_RETRIES attempts"
exit 1
