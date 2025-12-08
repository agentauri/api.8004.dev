/**
 * Database queries tests
 * @module test/unit/db/queries
 */

import { env } from 'cloudflare:test';
import {
  cleanupOldJobs,
  deleteClassification,
  enqueueClassification,
  getAllClassifications,
  getClassification,
  getClassificationCountByChain,
  getClassificationsByChain,
  getPendingJobs,
  getQueueStatus,
  getTotalClassificationCount,
  incrementJobAttempts,
  markJobProcessing,
  updateQueueStatus,
  upsertClassification,
} from '@/db/queries';
import { describe, expect, it } from 'vitest';
import { insertMockClassification } from '../../setup';

describe('Classification queries', () => {
  describe('getClassification', () => {
    it('returns null for non-existent agent', async () => {
      const result = await getClassification(env.DB, 'nonexistent:1');
      expect(result).toBeNull();
    });

    it('returns classification for existing agent', async () => {
      const agentId = '11155111:1';
      await insertMockClassification(agentId);

      const result = await getClassification(env.DB, agentId);
      expect(result).not.toBeNull();
      expect(result?.agent_id).toBe(agentId);
    });
  });

  describe('upsertClassification', () => {
    it('inserts new classification', async () => {
      const agentId = '11155111:2';
      await upsertClassification(env.DB, {
        agent_id: agentId,
        chain_id: 11155111,
        skills: '[]',
        domains: '[]',
        confidence: 0.9,
        model_version: 'test',
        classified_at: new Date().toISOString(),
      });

      const result = await getClassification(env.DB, agentId);
      expect(result).not.toBeNull();
      expect(result?.confidence).toBe(0.9);
    });

    it('updates existing classification', async () => {
      const agentId = '11155111:3';
      await upsertClassification(env.DB, {
        agent_id: agentId,
        chain_id: 11155111,
        skills: '[]',
        domains: '[]',
        confidence: 0.8,
        model_version: 'test',
        classified_at: new Date().toISOString(),
      });

      await upsertClassification(env.DB, {
        agent_id: agentId,
        chain_id: 11155111,
        skills: '[]',
        domains: '[]',
        confidence: 0.95,
        model_version: 'test-v2',
        classified_at: new Date().toISOString(),
      });

      const result = await getClassification(env.DB, agentId);
      expect(result?.confidence).toBe(0.95);
      expect(result?.model_version).toBe('test-v2');
    });
  });

  describe('deleteClassification', () => {
    it('deletes existing classification', async () => {
      const agentId = '11155111:4';
      await insertMockClassification(agentId);

      await deleteClassification(env.DB, agentId);

      const result = await getClassification(env.DB, agentId);
      expect(result).toBeNull();
    });
  });

  describe('getClassificationsByChain', () => {
    it('returns classifications for chain', async () => {
      await insertMockClassification('11155111:5');
      await insertMockClassification('11155111:6');
      await insertMockClassification('84532:1', { chain_id: 84532 });

      const result = await getClassificationsByChain(env.DB, 11155111, 10, 0);
      expect(result.length).toBe(2);
    });
  });

  describe('getAllClassifications', () => {
    it('returns paginated results', async () => {
      await insertMockClassification('11155111:7');
      await insertMockClassification('11155111:8');
      await insertMockClassification('11155111:9');

      const result = await getAllClassifications(env.DB, 2, 0);
      expect(result.length).toBe(2);
    });
  });

  describe('count queries', () => {
    it('returns total count', async () => {
      await insertMockClassification('11155111:10');
      await insertMockClassification('11155111:11');

      const count = await getTotalClassificationCount(env.DB);
      expect(count).toBe(2);
    });

    it('returns count by chain', async () => {
      await insertMockClassification('11155111:12');
      await insertMockClassification('11155111:13');
      await insertMockClassification('84532:2', { chain_id: 84532 });

      const count = await getClassificationCountByChain(env.DB, 11155111);
      expect(count).toBe(2);
    });
  });
});

describe('Queue queries', () => {
  describe('enqueueClassification', () => {
    it('creates queue entry', async () => {
      const agentId = '11155111:100';
      const id = await enqueueClassification(env.DB, agentId);

      expect(id).toBeDefined();

      const status = await getQueueStatus(env.DB, agentId);
      expect(status).not.toBeNull();
      expect(status?.status).toBe('pending');
    });
  });

  describe('getQueueStatus', () => {
    it('returns null for non-existent agent', async () => {
      const status = await getQueueStatus(env.DB, 'nonexistent:999');
      expect(status).toBeNull();
    });

    it('returns latest status', async () => {
      const agentId = '11155111:101';
      await enqueueClassification(env.DB, agentId);

      const status = await getQueueStatus(env.DB, agentId);
      expect(status?.agent_id).toBe(agentId);
    });
  });

  describe('updateQueueStatus', () => {
    it('updates status', async () => {
      const agentId = '11155111:102';
      const id = await enqueueClassification(env.DB, agentId);

      await updateQueueStatus(env.DB, id, 'completed');

      const status = await getQueueStatus(env.DB, agentId);
      expect(status?.status).toBe('completed');
    });

    it('updates status with error', async () => {
      const agentId = '11155111:103';
      const id = await enqueueClassification(env.DB, agentId);

      await updateQueueStatus(env.DB, id, 'failed', 'Test error');

      const status = await getQueueStatus(env.DB, agentId);
      expect(status?.status).toBe('failed');
      expect(status?.error).toBe('Test error');
    });
  });

  describe('markJobProcessing', () => {
    it('marks job as processing', async () => {
      const agentId = '11155111:104';
      const id = await enqueueClassification(env.DB, agentId);

      await markJobProcessing(env.DB, id);

      const status = await getQueueStatus(env.DB, agentId);
      expect(status?.status).toBe('processing');
    });
  });

  describe('incrementJobAttempts', () => {
    it('increments attempts', async () => {
      const agentId = '11155111:105';
      const id = await enqueueClassification(env.DB, agentId);

      await incrementJobAttempts(env.DB, id);
      await incrementJobAttempts(env.DB, id);

      const status = await getQueueStatus(env.DB, agentId);
      expect(status?.attempts).toBe(2);
    });
  });

  describe('getPendingJobs', () => {
    it('returns pending jobs', async () => {
      await enqueueClassification(env.DB, '11155111:106');
      await enqueueClassification(env.DB, '11155111:107');

      const jobs = await getPendingJobs(env.DB, 10);
      expect(jobs.length).toBe(2);
      expect(jobs.every((j) => j.status === 'pending')).toBe(true);
    });

    it('respects limit', async () => {
      await enqueueClassification(env.DB, '11155111:108');
      await enqueueClassification(env.DB, '11155111:109');
      await enqueueClassification(env.DB, '11155111:110');

      const jobs = await getPendingJobs(env.DB, 2);
      expect(jobs.length).toBe(2);
    });
  });

  describe('cleanupOldJobs', () => {
    it('returns 0 when no old jobs exist', async () => {
      // No jobs to clean
      const deleted = await cleanupOldJobs(env.DB, 7);
      expect(deleted).toBe(0);
    });

    it('does not clean up pending jobs', async () => {
      await enqueueClassification(env.DB, '11155111:201');

      const deleted = await cleanupOldJobs(env.DB, 0);
      expect(deleted).toBe(0);
    });

    it('does not clean up recent completed jobs', async () => {
      await enqueueClassification(env.DB, '11155111:202');
      const status = await getQueueStatus(env.DB, '11155111:202');
      await updateQueueStatus(env.DB, status?.id, 'completed');

      // Cleanup with 1 day should keep it (it's less than 1 day old)
      const deleted = await cleanupOldJobs(env.DB, 1);
      expect(deleted).toBe(0);
    });
  });
});
