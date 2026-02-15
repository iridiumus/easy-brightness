#!/bin/bash
# Test script: detect Philips 244E monitors and show their brightness

echo "=== Detecting monitors ==="

# Parse ddcutil detect output to get bus numbers and serial numbers
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

echo "Found ${#monitors[@]} monitor(s):"
for m in "${monitors[@]}"; do
	bus="${m%%:*}"
	serial="${m##*:}"
	echo "  Bus: i2c-$bus  Serial: $serial"
done

echo ""
echo "=== Reading brightness ==="
for m in "${monitors[@]}"; do
	bus="${m%%:*}"
	serial="${m##*:}"
	result=$(ddcutil --bus "$bus" getvcp 10 2>&1)
	if [[ "$result" =~ current\ value\ =\ +([0-9]+) ]]; then
		current="${BASH_REMATCH[1]}"
		echo "  Monitor $serial (bus $bus): brightness = $current%"
	else
		echo "  Monitor $serial (bus $bus): FAILED to read brightness"
		echo "    $result"
	fi
done
