import { defineConfig } from 'vitepress';

export default defineConfig({
  title: '8004 API',
  description: 'AI Agent Registry API - Discover, evaluate, and compose AI agents on blockchain',

  // GitHub Pages base path
  base: '/api.8004.dev/',

  // Clean URLs (no .html extension)
  cleanUrls: true,

  // Last updated timestamp
  lastUpdated: true,

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#5f6bff' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: '8004 API Documentation' }],
    [
      'meta',
      {
        property: 'og:description',
        content: 'AI Agent Registry API - Discover, evaluate, and compose AI agents on blockchain',
      },
    ],
  ],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API Reference', link: '/api/' },
      { text: 'MCP Server', link: '/mcp/overview' },
      { text: 'Concepts', link: '/concepts/oasf-taxonomy' },
      {
        text: 'Resources',
        items: [
          { text: 'OpenAPI Spec', link: 'https://api.8004.dev/api/v1/openapi' },
          { text: 'GitHub', link: 'https://github.com/agentauri/api.8004.dev' },
          { text: '8004.dev Explorer', link: 'https://8004.dev' },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Authentication', link: '/guide/authentication' },
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Rate Limiting', link: '/guide/rate-limiting' },
            { text: 'Error Handling', link: '/guide/error-handling' },
            { text: 'Pagination', link: '/guide/pagination' },
          ],
        },
      ],

      '/api/': [
        {
          text: 'API Reference',
          items: [{ text: 'Overview', link: '/api/' }],
        },
        {
          text: 'Agent Discovery',
          items: [
            { text: 'Agents', link: '/api/agents' },
            { text: 'Search', link: '/api/search' },
            { text: 'Classification', link: '/api/classification' },
          ],
        },
        {
          text: 'Reputation & Feedback',
          items: [
            { text: 'Reputation', link: '/api/reputation' },
            { text: 'Feedbacks', link: '/api/feedbacks' },
            { text: 'Leaderboard', link: '/api/leaderboard' },
          ],
        },
        {
          text: 'Agent Intelligence',
          items: [
            { text: 'Evaluate', link: '/api/evaluate' },
            { text: 'Compose', link: '/api/compose' },
            { text: 'Intents', link: '/api/intents' },
          ],
        },
        {
          text: 'Real-time & Data',
          items: [
            { text: 'Events (SSE)', link: '/api/events' },
            { text: 'Chains', link: '/api/chains' },
            { text: 'Stats', link: '/api/stats' },
            { text: 'Taxonomy', link: '/api/taxonomy' },
            { text: 'Health', link: '/api/health' },
          ],
        },
        {
          text: 'Platform Management',
          items: [
            { text: 'API Keys', link: '/api/keys' },
            { text: 'Webhooks', link: '/api/webhooks' },
            { text: 'Analytics', link: '/api/analytics' },
          ],
        },
      ],

      '/mcp/': [
        {
          text: 'MCP Server',
          items: [
            { text: 'Overview', link: '/mcp/overview' },
            { text: 'Tools Reference', link: '/mcp/tools' },
            { text: 'Setup Guide', link: '/mcp/setup' },
            { text: 'Frontend Integration', link: '/mcp/frontend' },
          ],
        },
      ],

      '/concepts/': [
        {
          text: 'Core Concepts',
          items: [
            { text: 'OASF Taxonomy', link: '/concepts/oasf-taxonomy' },
            { text: 'Semantic Search', link: '/concepts/semantic-search' },
            { text: 'HyDE Query Expansion', link: '/concepts/hyde' },
            { text: 'LLM Reranking', link: '/concepts/reranking' },
            { text: 'Trust & Reputation', link: '/concepts/trust-reputation' },
          ],
        },
      ],

      '/contributing/': [
        {
          text: 'Contributing',
          items: [
            { text: 'Contribution Guide', link: '/contributing/' },
            { text: 'Architecture', link: '/contributing/architecture' },
            { text: 'Testing', link: '/contributing/testing' },
            { text: 'Deployment', link: '/contributing/deployment' },
          ],
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/agentauri/api.8004.dev' }],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright 2024-present 8004.dev',
    },

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/agentauri/api.8004.dev/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    outline: {
      level: [2, 3],
    },
  },
});
