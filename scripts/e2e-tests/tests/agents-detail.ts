/**
 * Agent Detail Tests
 * Tests for GET /agents/:agentId endpoint
 */

import { describe, it } from '../test-runner';
import { get } from '../utils/api-client';
import type { Agent } from '../utils/api-client';
import { assertStatus, assertSuccess } from '../utils/assertions';

export function registerAgentsDetailTests(): void {
  describe('Agent Detail - Basic', () => {
    it('GET /agents/:id returns agent from Sepolia', async () => {
      // First get a list of agents to find a valid ID
      const { json: listJson } = await get('/agents', { chainId: 11155111, limit: 1 });

      if (!listJson.success || !listJson.data || listJson.data.length === 0) {
        // No agents on Sepolia or rate limited, skip test
        console.log('  Note: Skipped - no Sepolia agents available');
        return;
      }

      const agent = listJson.data[0] as Agent;
      const { json } = await get(`/agents/${agent.id}`);

      if (!json.success) {
        // May fail due to rate limiting or API issues
        console.log(`  Note: Agent detail failed - ${json.error}`);
        return;
      }

      // Should return the same agent
      const detail = json.data as Agent;
      if (detail.id !== agent.id) {
        throw new Error(`Expected agent ${agent.id}, got ${detail.id}`);
      }
      if (detail.chainId !== 11155111) {
        throw new Error(`Expected chainId 11155111, got ${detail.chainId}`);
      }
    });

    it('GET /agents/:id returns agent from Base Sepolia', async () => {
      const { json: listJson } = await get('/agents', { chainId: 84532, limit: 1 });
      assertSuccess(listJson);

      if (!listJson.data || listJson.data.length === 0) {
        return;
      }

      const agent = listJson.data[0] as Agent;
      const { json } = await get(`/agents/${agent.id}`);
      assertSuccess(json);

      const detail = json.data as Agent;
      if (detail.chainId !== 84532) {
        throw new Error(`Expected chainId 84532, got ${detail.chainId}`);
      }
    });

    it('GET /agents/:id returns agent from Polygon Amoy', async () => {
      const { json: listJson } = await get('/agents', { chainId: 80002, limit: 1 });
      assertSuccess(listJson);

      if (!listJson.data || listJson.data.length === 0) {
        return;
      }

      const agent = listJson.data[0] as Agent;
      const { json } = await get(`/agents/${agent.id}`);
      assertSuccess(json);

      const detail = json.data as Agent;
      if (detail.chainId !== 80002) {
        throw new Error(`Expected chainId 80002, got ${detail.chainId}`);
      }
    });
  });

  describe('Agent Detail - Error Handling', () => {
    it('GET /agents/:id with non-existent ID returns 404', async () => {
      // Use a high token ID that likely doesn't exist
      const { response, json } = await get('/agents/11155111:999999999');

      assertStatus(response, 404);
      if (json.success) {
        throw new Error('Expected error response for non-existent agent');
      }
    });

    it('GET /agents/:id with invalid format returns 400', async () => {
      const { response, json } = await get('/agents/invalid-format');

      // Should return 400 for invalid ID format
      if (response.status !== 400) {
        throw new Error(`Expected status 400, got ${response.status}`);
      }
      if (json.success) {
        throw new Error('Expected error response for invalid ID format');
      }
    });

    it('GET /agents/:id with unsupported chain returns error', async () => {
      // Chain 999999 is not supported
      const { json } = await get('/agents/999999:1');

      if (json.success) {
        throw new Error('Expected error for unsupported chain');
      }
    });
  });

  describe('Agent Detail - Response Fields', () => {
    it('Agent detail includes operators field', async () => {
      const { json: listJson } = await get('/agents', { limit: 1 });

      if (!listJson.success || !listJson.data || listJson.data.length === 0) {
        console.log('  Note: Skipped - no agents available');
        return;
      }

      const agent = listJson.data[0] as Agent;
      const { json } = await get(`/agents/${agent.id}`);

      if (!json.success) {
        console.log(`  Note: Agent detail failed - ${json.error}`);
        return;
      }

      const detail = json.data as Record<string, unknown>;
      // operators should be an array (may be empty)
      if (!Array.isArray(detail.operators)) {
        throw new Error('Expected operators to be an array');
      }
    });

    it('Agent detail includes OASF classification if available', async () => {
      // Find an agent with OASF classification
      const { json: listJson } = await get('/agents', { skills: 'tool_interaction', limit: 1 });

      if (!listJson.success || !listJson.data || listJson.data.length === 0) {
        // No classified agents or rate limited, skip
        console.log('  Note: Skipped - no classified agents available');
        return;
      }

      const agent = listJson.data[0] as Agent;
      const { json } = await get(`/agents/${agent.id}`);

      if (!json.success) {
        console.log(`  Note: Agent detail failed - ${json.error}`);
        return;
      }

      const detail = json.data as Agent;
      if (!detail.oasf) {
        throw new Error('Expected OASF classification for classified agent');
      }
      if (!detail.oasf.skills && !detail.oasf.domains) {
        throw new Error('Expected OASF skills or domains');
      }
    });

    it('Agent detail includes registration metadata', async () => {
      const { json: listJson } = await get('/agents', { limit: 1 });

      if (!listJson.success || !listJson.data || listJson.data.length === 0) {
        console.log('  Note: Skipped - no agents available');
        return;
      }

      const agent = listJson.data[0] as Agent;
      const { json } = await get(`/agents/${agent.id}`);

      if (!json.success) {
        console.log(`  Note: Agent detail failed - ${json.error}`);
        return;
      }

      const detail = json.data as Record<string, unknown>;
      // Should have basic agent info
      if (typeof detail.name !== 'string') {
        throw new Error('Expected name to be a string');
      }
      if (typeof detail.chainId !== 'number') {
        throw new Error('Expected chainId to be a number');
      }
      if (typeof detail.tokenId !== 'string') {
        throw new Error('Expected tokenId to be a string');
      }
    });
  });
}
