# LLM Reranking

Cross-encoder reranking improves search precision by using an LLM to score query-result relevance.

## Overview

After semantic search retrieves candidate results using vector similarity, reranking applies a cross-encoder model to score how well each result matches the query intent.

```
Query → Vector Search → Top 50 Candidates → LLM Reranker → Final Results
```

Unlike bi-encoder embedding similarity (used in initial retrieval), cross-encoders consider the query and document together, enabling more nuanced relevance judgments.

## How It Works

### 1. Initial Retrieval

Vector search finds top candidates based on embedding similarity:

```
Query: "AI agent for trading stocks"
     ↓
Vector Similarity Search (BGE-M3)
     ↓
Top 50 candidates by cosine similarity
```

### 2. Cross-Encoder Scoring

The LLM evaluates each candidate against the original query:

```
For each candidate:
  - Consider how well capabilities match query intent
  - Evaluate relevance of skills and domains
  - Assess specificity of the match
  - Return relevance score (0.0 to 1.0)
```

### 3. Final Ranking

Results are reordered by LLM relevance scores:

```
Before reranking:      After reranking:
1. Agent A (0.85)  →   1. Agent C (0.95)
2. Agent B (0.82)  →   2. Agent A (0.88)
3. Agent C (0.80)  →   3. Agent E (0.85)
```

## Benefits

| Aspect | Bi-Encoder | Cross-Encoder |
|--------|------------|---------------|
| Speed | Fast (single pass) | Slower (per-pair) |
| Context | Query and doc separate | Query and doc together |
| Precision | Good | Better |
| Scale | Millions of docs | Top K candidates |

## When Reranking Helps

Reranking is most beneficial when:

- **Semantic ambiguity**: Query could match multiple interpretations
- **Domain specificity**: Technical queries needing precise matches
- **Capability matching**: Finding agents with specific skill combinations
- **Intent understanding**: Natural language queries with implicit requirements

## API Integration

Reranking is automatically applied in streaming search:

```bash
curl -X POST "https://api.8004.dev/api/v1/search/stream" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "query": "trading bot for cryptocurrency markets"
  }'
```

The response includes reranking metadata:

```json
{
  "result": {
    "success": true,
    "total": 15,
    "metadata": {
      "rerankerUsed": true,
      "rerankTimeMs": 245,
      "itemsReranked": 50
    }
  }
}
```

## Response Fields

When reranking is applied, results include:

| Field | Type | Description |
|-------|------|-------------|
| `score` | number | Final score after reranking |
| `rerankerScore` | number | Score from LLM reranker (0-1) |
| `originalScore` | number | Initial vector similarity score |

## Configuration

Reranking is controlled by environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `RERANKER_ENABLED` | `false` | Enable/disable reranking |
| `RERANKER_MODEL` | `gemini-2.0-flash` | LLM model for scoring |
| `RERANKER_TOP_K` | `50` | Number of candidates to rerank |

## Performance Considerations

- **Latency**: Adds 100-300ms to search time
- **Top K limit**: Only top 50 candidates are reranked
- **Fallback**: If reranking fails, original order is preserved
- **Skip condition**: Reranking is skipped for 3 or fewer results

## Scoring Criteria

The LLM evaluates each agent based on:

1. **Capability Match**: How well agent skills align with query intent
2. **Domain Relevance**: Appropriateness of agent's target domains
3. **Specificity**: How precisely the agent addresses the query
4. **Description Quality**: Clarity and relevance of agent description

## Example Improvement

Query: "Code review assistant for Python projects"

| Agent | Vector Score | Reranker Score | Improvement |
|-------|--------------|----------------|-------------|
| Python Code Reviewer | 0.78 | 0.95 | +0.17 |
| General Code Helper | 0.82 | 0.72 | -0.10 |
| JavaScript Linter | 0.75 | 0.45 | -0.30 |

The reranker promotes the Python-specific code reviewer despite its lower initial vector similarity.

## Technical Details

The reranker uses a cross-encoder approach:

```
Prompt Template:
- Present query and all candidate agents
- Ask LLM to score relevance (0.0-1.0)
- Parse JSON response for scores
- Handle parsing failures gracefully
```

Reference: [Dense Passage Retrieval for Open-Domain Question Answering](https://arxiv.org/abs/2010.08240)

## Related

- [Semantic Search](/concepts/semantic-search)
- [HyDE Query Expansion](/concepts/hyde)
- [Search API Reference](/api/search)
