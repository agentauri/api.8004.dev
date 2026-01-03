/**
 * OASF prompt builder tests
 * @module test/unit/lib/oasf/prompt
 */

import { describe, expect, it } from 'vitest';
import { buildClassificationPrompt } from '@/lib/oasf/prompt';
import { OASF_VERSION } from '@/lib/oasf/taxonomy';

describe('buildClassificationPrompt', () => {
  it('includes agent name and description', () => {
    const agent = {
      agentId: '11155111:1',
      name: 'Test Agent',
      description: 'A test agent for classification',
    };

    const prompt = buildClassificationPrompt(agent);

    expect(prompt).toContain('Name: Test Agent');
    expect(prompt).toContain('Description: A test agent for classification');
  });

  it('includes OASF version', () => {
    const agent = {
      agentId: '11155111:1',
      name: 'Test Agent',
      description: 'A test agent',
    };

    const prompt = buildClassificationPrompt(agent);

    expect(prompt).toContain(`OASF (Open Agentic Schema Framework) taxonomy v${OASF_VERSION}`);
  });

  it('includes MCP tools when provided', () => {
    const agent = {
      agentId: '11155111:1',
      name: 'Test Agent',
      description: 'A test agent',
      mcpTools: ['code_execution', 'web_search', 'file_access'],
    };

    const prompt = buildClassificationPrompt(agent);

    expect(prompt).toContain('MCP Tools: code_execution, web_search, file_access');
  });

  it('shows None for MCP tools when empty', () => {
    const agent = {
      agentId: '11155111:1',
      name: 'Test Agent',
      description: 'A test agent',
      mcpTools: [],
    };

    const prompt = buildClassificationPrompt(agent);

    expect(prompt).toContain('MCP Tools: None');
  });

  it('shows None for MCP tools when undefined', () => {
    const agent = {
      agentId: '11155111:1',
      name: 'Test Agent',
      description: 'A test agent',
    };

    const prompt = buildClassificationPrompt(agent);

    expect(prompt).toContain('MCP Tools: None');
  });

  it('includes A2A skills when provided', () => {
    const agent = {
      agentId: '11155111:1',
      name: 'Test Agent',
      description: 'A test agent',
      a2aSkills: ['natural_language', 'data_analysis'],
    };

    const prompt = buildClassificationPrompt(agent);

    expect(prompt).toContain('A2A Skills: natural_language, data_analysis');
  });

  it('shows None for A2A skills when empty', () => {
    const agent = {
      agentId: '11155111:1',
      name: 'Test Agent',
      description: 'A test agent',
      a2aSkills: [],
    };

    const prompt = buildClassificationPrompt(agent);

    expect(prompt).toContain('A2A Skills: None');
  });

  it('includes skill taxonomy categories', () => {
    const agent = {
      agentId: '11155111:1',
      name: 'Test Agent',
      description: 'A test agent',
    };

    const prompt = buildClassificationPrompt(agent);

    // Check for some known skill categories
    expect(prompt).toContain('## Available Skill Categories');
    expect(prompt).toContain('natural_language_processing');
  });

  it('includes domain taxonomy categories', () => {
    const agent = {
      agentId: '11155111:1',
      name: 'Test Agent',
      description: 'A test agent',
    };

    const prompt = buildClassificationPrompt(agent);

    // Check for some known domain categories
    expect(prompt).toContain('## Available Domain Categories');
    expect(prompt).toContain('technology');
  });

  it('includes classification rules', () => {
    const agent = {
      agentId: '11155111:1',
      name: 'Test Agent',
      description: 'A test agent',
    };

    const prompt = buildClassificationPrompt(agent);

    expect(prompt).toContain('## Classification Rules');
    expect(prompt).toContain('Assign 1-5 most relevant skills');
    expect(prompt).toContain('Assign 1-3 most relevant domains');
    expect(prompt).toContain('confidence score');
  });

  it('includes response format', () => {
    const agent = {
      agentId: '11155111:1',
      name: 'Test Agent',
      description: 'A test agent',
    };

    const prompt = buildClassificationPrompt(agent);

    expect(prompt).toContain('## Response Format');
    expect(prompt).toContain('"skills"');
    expect(prompt).toContain('"domains"');
    expect(prompt).toContain('"confidence"');
    expect(prompt).toContain('"reasoning"');
  });

  it('ends with classification instruction', () => {
    const agent = {
      agentId: '11155111:1',
      name: 'Test Agent',
      description: 'A test agent',
    };

    const prompt = buildClassificationPrompt(agent);

    expect(prompt).toContain('Classify this agent now:');
  });
});
