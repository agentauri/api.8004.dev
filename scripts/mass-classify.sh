#!/bin/bash
# Mass classification script - Uses same pagination logic as frontend
# Properly URL-encodes cursor for API requests

API_KEY="1e9ec126b94c04df3646058bdf4d04a7c73389d9e045571acd7aba7ef48389d0"
BASE_URL="https://api.8004.dev/api/v1"
BATCH_SIZE=50
DELAY_BETWEEN_REQUESTS=0.5  # 500ms between requests
DELAY_BETWEEN_PAGES=2       # 2s between pages

PAGE=1
TOTAL_PROCESSED=0
TOTAL_QUEUED=0
TOTAL_ALREADY=0

echo "=========================================="
echo "Mass Classification Script"
echo "Using: Gemini 2.0 Flash"
echo "Batch size: $BATCH_SIZE"
echo "=========================================="

# Paginate through all agents with registration files
NEXT_CURSOR=""

while true; do
    echo ""
    echo "=== Page $PAGE (processed: $TOTAL_PROCESSED, queued: $TOTAL_QUEUED) ==="

    # Build URL - use --data-urlencode for proper cursor encoding
    if [ -z "$NEXT_CURSOR" ]; then
        RESPONSE=$(curl -s --get "$BASE_URL/agents" \
            --data-urlencode "limit=$BATCH_SIZE" \
            --data-urlencode "hasRegistration=true" \
            -H "X-API-Key: $API_KEY")
    else
        RESPONSE=$(curl -s --get "$BASE_URL/agents" \
            --data-urlencode "limit=$BATCH_SIZE" \
            --data-urlencode "hasRegistration=true" \
            --data-urlencode "cursor=$NEXT_CURSOR" \
            -H "X-API-Key: $API_KEY")
    fi

    # Check for errors
    SUCCESS=$(echo "$RESPONSE" | jq -r '.success // false')
    if [ "$SUCCESS" != "true" ]; then
        ERROR=$(echo "$RESPONSE" | jq -r '.error // "unknown"')
        echo "Error: $ERROR"
        if [[ "$ERROR" == *"Rate limit"* ]]; then
            echo "Rate limited, waiting 60s..."
            sleep 60
            continue
        fi
        break
    fi

    # Get agents from response
    AGENT_COUNT=$(echo "$RESPONSE" | jq '.data | length')
    echo "Found $AGENT_COUNT agents"

    if [ "$AGENT_COUNT" -eq 0 ]; then
        echo "No more agents"
        break
    fi

    # Process each agent - queue for classification
    AGENT_IDS=$(echo "$RESPONSE" | jq -r '.data[].id')
    for AGENT_ID in $AGENT_IDS; do
        CLASSIFY_RESP=$(curl -s -X POST "$BASE_URL/agents/$AGENT_ID/classify" \
            -H "X-API-Key: $API_KEY" \
            -H "Content-Type: application/json" \
            -d '{}')

        STATUS=$(echo "$CLASSIFY_RESP" | jq -r '.status // .error // "unknown"')
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

    # Get next cursor from response
    NEXT_CURSOR=$(echo "$RESPONSE" | jq -r '.meta.nextCursor // empty')
    if [ -z "$NEXT_CURSOR" ] || [ "$NEXT_CURSOR" = "null" ]; then
        echo "No more pages (nextCursor is empty)"
        break
    fi

    echo "Next cursor: ${NEXT_CURSOR:0:40}..."
    ((PAGE++))
    sleep $DELAY_BETWEEN_PAGES
done

echo ""
echo "=========================================="
echo "Done! Processed: $TOTAL_PROCESSED, Queued: $TOTAL_QUEUED, Already: $TOTAL_ALREADY"
echo "=========================================="
