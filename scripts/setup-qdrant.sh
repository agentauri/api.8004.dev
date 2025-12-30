#!/bin/bash
# Setup Qdrant collection
# Usage: QDRANT_URL=... QDRANT_KEY=... ./setup-qdrant.sh

if [ -z "$QDRANT_URL" ] || [ -z "$QDRANT_KEY" ]; then
  echo "Error: QDRANT_URL and QDRANT_KEY environment variables must be set"
  echo "Usage: QDRANT_URL=https://your-cluster.qdrant.io QDRANT_KEY=your-api-key ./setup-qdrant.sh"
  exit 1
fi

echo "Creating 'agents' collection..."

curl -s -X PUT "${QDRANT_URL}/collections/agents" \
  -H "api-key: ${QDRANT_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "vectors": {
      "size": 1024,
      "distance": "Cosine"
    },
    "optimizers_config": {
      "indexing_threshold": 0
    }
  }'

echo ""
echo "Creating payload indexes..."

# Index on chain_id (integer)
curl -s -X PUT "${QDRANT_URL}/collections/agents/index" \
  -H "api-key: ${QDRANT_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"field_name": "chain_id", "field_schema": "integer"}'

# Index on reputation (integer)
curl -s -X PUT "${QDRANT_URL}/collections/agents/index" \
  -H "api-key: ${QDRANT_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"field_name": "reputation", "field_schema": "integer"}'

# Index on active (bool)
curl -s -X PUT "${QDRANT_URL}/collections/agents/index" \
  -H "api-key: ${QDRANT_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"field_name": "active", "field_schema": "bool"}'

# Index on has_mcp (bool)
curl -s -X PUT "${QDRANT_URL}/collections/agents/index" \
  -H "api-key: ${QDRANT_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"field_name": "has_mcp", "field_schema": "bool"}'

# Index on has_a2a (bool)
curl -s -X PUT "${QDRANT_URL}/collections/agents/index" \
  -H "api-key: ${QDRANT_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"field_name": "has_a2a", "field_schema": "bool"}'

# Index on x402_support (bool)
curl -s -X PUT "${QDRANT_URL}/collections/agents/index" \
  -H "api-key: ${QDRANT_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"field_name": "x402_support", "field_schema": "bool"}'

# Index on skills (keyword array)
curl -s -X PUT "${QDRANT_URL}/collections/agents/index" \
  -H "api-key: ${QDRANT_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"field_name": "skills", "field_schema": "keyword"}'

# Index on domains (keyword array)
curl -s -X PUT "${QDRANT_URL}/collections/agents/index" \
  -H "api-key: ${QDRANT_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"field_name": "domains", "field_schema": "keyword"}'

# Index on name (text for full-text search)
curl -s -X PUT "${QDRANT_URL}/collections/agents/index" \
  -H "api-key: ${QDRANT_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"field_name": "name", "field_schema": "text"}'

echo ""
echo "Verifying collection..."
curl -s "${QDRANT_URL}/collections/agents" \
  -H "api-key: ${QDRANT_KEY}" | jq

echo ""
echo "Done!"
