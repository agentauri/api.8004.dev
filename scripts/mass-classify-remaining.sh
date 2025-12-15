#!/bin/bash
# Mass classification script - Process ALL agents (without hasRegistration filter)
# This catches agents that were missed due to the pagination bug

API_KEY="1e9ec126b94c04df3646058bdf4d04a7c73389d9e045571acd7aba7ef48389d0"
BASE_URL="https://api.8004.dev/api/v1"
BATCH_SIZE=100
DELAY_BETWEEN_REQUESTS=0.4

# Start from offset 700 to skip already processed agents
START_OFFSET=700

PAGE=1
TOTAL_PROCESSED=0
TOTAL_QUEUED=0
TOTAL_ALREADY=0

echo "=========================================="
echo "Mass Classification - Remaining Agents"
echo "Starting from offset: $START_OFFSET"
echo "=========================================="
echo ""

# Start pagination from the given offset
CURSOR="{\"_global_offset\":$START_OFFSET}"

while true; do
    ENCODED_CURSOR=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$CURSOR'))")
    URL="$BASE_URL/agents?limit=$BATCH_SIZE&cursor=$ENCODED_CURSOR"

    echo ""
    echo "=== Page $PAGE (offset: $(echo $CURSOR | grep -o '[0-9]*'), queued: $TOTAL_QUEUED, skipped: $TOTAL_ALREADY) ==="
    RESPONSE=$(curl -s "$URL" -H "X-API-Key: $API_KEY")

    SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
    if [ "$SUCCESS" != "true" ]; then
        ERROR_MSG=$(echo "$RESPONSE" | jq -r '.error // "unknown"')
        echo "Error: $ERROR_MSG, waiting 60s..."
        sleep 60
        continue
    fi

    AGENT_COUNT=$(echo "$RESPONSE" | jq '.data | length')
    echo "Processing $AGENT_COUNT agents..."

    if [ "$AGENT_COUNT" -eq 0 ]; then
        echo "No more agents"
        break
    fi

    for AGENT_ID in $(echo "$RESPONSE" | jq -r '.data[].id'); do
        # Only try to classify agents that have registration file
        HAS_REG=$(echo "$RESPONSE" | jq -r ".data[] | select(.id == \"$AGENT_ID\") | .oasfSource != \"none\"")

        CLASSIFY_RESPONSE=$(curl -s -X POST "$BASE_URL/agents/$AGENT_ID/classify" \
            -H "X-API-Key: $API_KEY" \
            -H "Content-Type: application/json" \
            -d '{}')

        STATUS=$(echo "$CLASSIFY_RESPONSE" | jq -r '.status // .error // "unknown"')

        case "$STATUS" in
            "queued") echo -n "+"; ((TOTAL_QUEUED++)) ;;
            "pending"|"processing") echo -n "~" ;;
            "already_classified") echo -n "."; ((TOTAL_ALREADY++)) ;;
            *"Rate limit"*) echo -n "R"; sleep 5 ;;
            *) echo -n "?" ;;
        esac

        ((TOTAL_PROCESSED++))
        sleep $DELAY_BETWEEN_REQUESTS
    done
    echo ""

    CURSOR=$(echo "$RESPONSE" | jq -r '.meta.nextCursor // empty')
    if [ -z "$CURSOR" ]; then
        echo "Reached end"
        break
    fi

    ((PAGE++))
done

echo ""
echo "=========================================="
echo "Complete! Processed: $TOTAL_PROCESSED, Queued: $TOTAL_QUEUED, Already: $TOTAL_ALREADY"
echo "=========================================="
