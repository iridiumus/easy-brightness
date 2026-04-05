#!/bin/bash
# Test script: read and set legacy compatibility channel (VCP 0x1A) on all monitors
# Usage:
#   ./test_legacy.sh              - read legacy channel from all monitors
#   ./test_legacy.sh set <value>  - set legacy channel (0-100) on all monitors

VCP_LEGACY_COMPAT=0x1a
MAX_RETRIES=5
RETRY_DELAY=2

read_legacy() {
	local bus="$1"
	local result
	result=$(ddcutil --bus "$bus" getvcp $VCP_LEGACY_COMPAT 2>&1)
	if [[ "$result" =~ current\ value\ =\ +([0-9]+) ]]; then
		echo "${BASH_REMATCH[1]}"
	else
		echo "-1"
	fi
}

# Detect monitors
monitors=()
while IFS= read -r line; do
	if [[ "$line" =~ I2C\ bus:.*(/dev/i2c-([0-9]+)) ]]; then
		bus="${BASH_REMATCH[2]}"
	fi
	if [[ "$line" =~ Serial\ number:\ +([A-Za-z0-9]+) ]]; then
		serial="${BASH_REMATCH[1]}"
		monitors+=("$bus:$serial")
	fi
done < <(ddcutil detect 2>/dev/null)

if [ ${#monitors[@]} -eq 0 ]; then
	echo "No monitors found!"
	exit 1
fi

echo "Found ${#monitors[@]} monitor(s)"

if [ "$1" = "set" ] && [ -n "$2" ]; then
	TARGET="$2"
		echo "=== Setting legacy channel to $TARGET on all monitors ==="
	for m in "${monitors[@]}"; do
		bus="${m%%:*}"
		serial="${m##*:}"
		echo ""
		echo "Monitor $serial (bus $bus):"

		for ((attempt = 1; attempt <= MAX_RETRIES; attempt++)); do
			current=$(read_legacy "$bus")
			echo "  Attempt $attempt: current legacy value = $current"

			if [ "$current" -eq "$TARGET" ]; then
				echo "  OK: already at target"
				break
			fi

			echo "  Setting to $TARGET..."
			ddcutil --bus "$bus" setvcp $VCP_LEGACY_COMPAT "$TARGET" 2>&1
			sleep "$RETRY_DELAY"

			actual=$(read_legacy "$bus")
			echo "  After set: legacy value = $actual"

			if [ "$actual" -eq "$TARGET" ]; then
				echo "  OK"
				break
			else
				echo "  MISMATCH: expected $TARGET, got $actual. Retrying..."
			fi
		done
	done
else
	echo "=== Reading legacy channel (VCP $VCP_LEGACY_COMPAT) ==="
	for m in "${monitors[@]}"; do
		bus="${m%%:*}"
		serial="${m##*:}"
		current=$(read_legacy "$bus")
		echo "  Monitor $serial (bus $bus): legacy value = $current"
	done
	echo ""
	echo "To set: $0 set <0-100>"
fi
