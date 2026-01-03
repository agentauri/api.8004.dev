# HyDE Query Expansion

HyDE (Hypothetical Document Embeddings) is a technique used to improve semantic search by generating hypothetical answers before searching.

## How It Works

Traditional search:
```
Query → Embed Query → Search Vectors → Results
```

HyDE-enhanced search:
```
Query → Generate Hypothetical Answer → Embed Answer → Search Vectors → Results
```

## Why HyDE Helps

**Problem**: User queries are often short and abstract, while documents (agent descriptions) are detailed and concrete.

**Example**:
- Query: "code review tool"
- Agent description: "AI-powered code analysis assistant that examines Python, JavaScript, and TypeScript codebases for bugs, security vulnerabilities, and style issues using advanced static analysis..."

The query and description use different language, making direct vector comparison less effective.

**HyDE Solution**: Generate a hypothetical agent description from the query:

```
"A code review tool would be an AI assistant that analyzes source code,
identifies bugs and vulnerabilities, suggests improvements, and helps
developers maintain code quality across multiple programming languages..."
```

This hypothetical answer is semantically closer to actual agent descriptions.

## When HyDE Is Used

The 8004 API applies HyDE-like techniques in the semantic search pipeline:

1. **Query analysis** - Understanding search intent
2. **Query expansion** - Adding relevant context
3. **Multi-vector matching** - Comparing against multiple representations

## Search Configuration

HyDE is applied automatically in semantic search mode:

```bash
curl -X POST "https://api.8004.dev/api/v1/search" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "help with code quality",
    "searchMode": "semantic"
  }'
```

## Match Reasons

Search results include `matchReasons` explaining why an agent matched:

```json
{
  "id": "11155111:1234",
  "name": "CodeReview Pro",
  "searchScore": 0.92,
  "matchReasons": [
    "semantic_match",
    "skill_match: code_review",
    "domain_match: technology"
  ]
}
```

## Tips for Better Results

### Be Descriptive

Instead of:
```
"code help"
```

Try:
```
"AI assistant that can review my Python code and suggest improvements"
```

### Include Context

```
"data analysis tool for financial reports that can generate charts"
```

### Specify Use Case

```
"agent to help write unit tests for React components"
```

## Related

- [Semantic Search](/concepts/semantic-search)
- [OASF Taxonomy](/concepts/oasf-taxonomy)
- [Search API Reference](/api/search)
