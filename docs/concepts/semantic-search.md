# Semantic Search

The 8004 API uses semantic search to find AI agents using natural language queries, going beyond simple keyword matching.

## How It Works

1. **Query Embedding**: Your search query is converted to a vector embedding
2. **Vector Similarity**: The query vector is compared against all agent vectors
3. **Ranking**: Results are ranked by semantic similarity
4. **Enrichment**: Top results are enriched with real-time data

## Search Modes

### Auto Mode (Default)

Tries semantic search first, falls back to name search if no results:

```bash
curl -X POST "https://api.8004.dev/api/v1/search" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"query": "code review assistant", "searchMode": "auto"}'
```

### Semantic Mode

Vector search only - returns empty if no semantic matches:

```bash
curl -X POST "https://api.8004.dev/api/v1/search" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"query": "code review assistant", "searchMode": "semantic"}'
```

### Name Mode

Substring search on agent names only:

```bash
curl -X POST "https://api.8004.dev/api/v1/search" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"query": "CodeReview", "searchMode": "name"}'
```

## Search Score

Each result includes a `searchScore` (0-1) indicating semantic similarity:

| Score | Quality |
|-------|---------|
| 0.8 - 1.0 | Excellent match |
| 0.6 - 0.8 | Good match |
| 0.4 - 0.6 | Fair match |
| 0.3 - 0.4 | Marginal match |

Filter by minimum score:

```bash
curl -X POST "https://api.8004.dev/api/v1/search" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"query": "data analysis", "minScore": 0.6}'
```

## Response Metadata

The `meta.searchMode` field indicates which search was used:

```json
{
  "meta": {
    "searchMode": "vector",
    "query": "code review",
    "total": 42
  }
}
```

| Mode | Description |
|------|-------------|
| `vector` | Semantic search was used |
| `name` | Name substring search was used |
| `fallback` | Vector returned 0 results, fell back to name |

## Combining Search with Filters

Semantic search works with all standard filters:

```bash
curl -X POST "https://api.8004.dev/api/v1/search" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "data visualization dashboard",
    "filters": {
      "chainIds": [11155111],
      "mcp": true,
      "skills": ["data_visualization"]
    }
  }'
```

## Vector Database

The 8004 API uses:
- **Qdrant Cloud** for vector storage
- **Venice AI** embeddings (text-embedding-bge-m3, 1024 dimensions)
- **2,900+** agents indexed

## Search via GET

You can also search using query parameters:

```bash
curl "https://api.8004.dev/api/v1/agents?q=code+review&mcp=true&limit=10" \
  -H "X-API-Key: your-api-key"
```

## Best Practices

### Be Specific

More specific queries yield better results:

```
Good: "Python code review tool for security vulnerabilities"
Less good: "code help"
```

### Use Filters

Combine semantic search with filters to narrow results:

```json
{
  "query": "financial data analysis",
  "filters": {
    "domains": ["finance"],
    "mcp": true
  }
}
```

### Handle Fallback

When `searchMode` is `fallback`, consider:
- The query might be too specific
- Try different phrasing
- Use filters to find relevant agents

## Related

- [Search API Reference](/api/search)
- [OASF Taxonomy](/concepts/oasf-taxonomy)
- [HyDE Query Expansion](/concepts/hyde)
