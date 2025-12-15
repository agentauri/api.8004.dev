/**
 * Database queries tests
 * @module test/unit/db/queries
 */

import { env } from 'cloudflare:test';
import {
  cleanupOldJobs,
  deleteClassification,
  enqueueClassification,
  enqueueClassificationsBatch,
  feedbackExistsByEasUid,
  getAllClassifications,
  getAllFeedback,
  getClassification,
  getClassificationCountByChain,
  getClassificationsBatch,
  getClassificationsByChain,
  getEasSyncState,
  getFeedbackCount,
  getPendingJobs,
  getQueueStatus,
  getRecentFeedback,
  getReputation,
  getReputationsBatch,
  getTotalClassificationCount,
  incrementJobAttempts,
  insertFeedback,
  markJobProcessing,
  updateEasSyncState,
  updateQueueStatus,
  upsertClassification,
  upsertReputation,
} from '@/db/queries';
import { describe, expect, it } from 'vitest';
import { insertMockClassification, insertMockFeedback, insertMockReputation } from '../../setup';

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

  describe('getClassificationsBatch', () => {
    it('returns empty map for empty array', async () => {
      const result = await getClassificationsBatch(env.DB, []);
      expect(result.size).toBe(0);
    });

    it('returns classifications for multiple agents', async () => {
      const agentId1 = '11155111:batch1';
      const agentId2 = '11155111:batch2';
      await insertMockClassification(agentId1);
      await insertMockClassification(agentId2);

      const result = await getClassificationsBatch(env.DB, [agentId1, agentId2]);
      expect(result.size).toBe(2);
      expect(result.get(agentId1)?.agent_id).toBe(agentId1);
      expect(result.get(agentId2)?.agent_id).toBe(agentId2);
    });

    it('returns only existing classifications', async () => {
      const agentId = '11155111:batchexist';
      await insertMockClassification(agentId);

      const result = await getClassificationsBatch(env.DB, [agentId, 'nonexistent:999']);
      expect(result.size).toBe(1);
      expect(result.get(agentId)).toBeDefined();
      expect(result.get('nonexistent:999')).toBeUndefined();
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

  describe('enqueueClassificationsBatch', () => {
    it('enqueues multiple agents', async () => {
      const agentIds = ['11155111:200', '11155111:201', '11155111:202'];
      const enqueued = await enqueueClassificationsBatch(env.DB, agentIds);

      expect(enqueued).toHaveLength(3);
      expect(enqueued).toEqual(agentIds);

      // Verify all are enqueued
      for (const agentId of agentIds) {
        const status = await getQueueStatus(env.DB, agentId);
        expect(status?.status).toBe('pending');
      }
    });

    it('returns empty array for empty input', async () => {
      const enqueued = await enqueueClassificationsBatch(env.DB, []);
      expect(enqueued).toEqual([]);
    });

    it('skips agents with pending jobs', async () => {
      const agentId1 = '11155111:300';
      const agentId2 = '11155111:301';

      // First, enqueue agent1
      await enqueueClassification(env.DB, agentId1);

      // Now try to batch enqueue both
      const enqueued = await enqueueClassificationsBatch(env.DB, [agentId1, agentId2]);

      // Should only enqueue agent2
      expect(enqueued).toHaveLength(1);
      expect(enqueued).toContain(agentId2);
    });

    it('skips agents with processing jobs', async () => {
      const agentId = '11155111:400';

      // Enqueue and mark as processing
      const id = await enqueueClassification(env.DB, agentId);
      await markJobProcessing(env.DB, id);

      // Try to batch enqueue same agent
      const enqueued = await enqueueClassificationsBatch(env.DB, [agentId]);

      // Should skip since already processing
      expect(enqueued).toEqual([]);
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

describe('Reputation queries', () => {
  describe('getReputation', () => {
    it('returns null for non-existent agent', async () => {
      const result = await getReputation(env.DB, 'nonexistent:1');
      expect(result).toBeNull();
    });

    it('returns reputation for existing agent', async () => {
      const agentId = '11155111:rep1';
      await insertMockReputation(agentId);

      const result = await getReputation(env.DB, agentId);
      expect(result).not.toBeNull();
      expect(result?.agent_id).toBe(agentId);
      expect(result?.feedback_count).toBe(5);
    });
  });

  describe('getReputationsBatch', () => {
    it('returns empty map for empty array', async () => {
      const result = await getReputationsBatch(env.DB, []);
      expect(result.size).toBe(0);
    });

    it('returns reputations for multiple agents', async () => {
      const agentId1 = '11155111:repbatch1';
      const agentId2 = '11155111:repbatch2';
      await insertMockReputation(agentId1);
      await insertMockReputation(agentId2);

      const result = await getReputationsBatch(env.DB, [agentId1, agentId2]);
      expect(result.size).toBe(2);
      expect(result.get(agentId1)?.agent_id).toBe(agentId1);
      expect(result.get(agentId2)?.agent_id).toBe(agentId2);
    });

    it('returns only existing reputations', async () => {
      const agentId = '11155111:repexist';
      await insertMockReputation(agentId);

      const result = await getReputationsBatch(env.DB, [agentId, 'nonexistent:999']);
      expect(result.size).toBe(1);
      expect(result.get(agentId)).toBeDefined();
      expect(result.get('nonexistent:999')).toBeUndefined();
    });
  });

  describe('upsertReputation', () => {
    it('inserts new reputation', async () => {
      const agentId = '11155111:repnew';
      await upsertReputation(env.DB, {
        agent_id: agentId,
        chain_id: 11155111,
        feedback_count: 10,
        average_score: 85.5,
        low_count: 0,
        medium_count: 3,
        high_count: 7,
        last_calculated_at: new Date().toISOString(),
      });

      const result = await getReputation(env.DB, agentId);
      expect(result).not.toBeNull();
      expect(result?.feedback_count).toBe(10);
      expect(result?.average_score).toBe(85.5);
    });

    it('updates existing reputation', async () => {
      const agentId = '11155111:repupdate';
      await insertMockReputation(agentId);

      await upsertReputation(env.DB, {
        agent_id: agentId,
        chain_id: 11155111,
        feedback_count: 20,
        average_score: 90.0,
        low_count: 1,
        medium_count: 4,
        high_count: 15,
        last_calculated_at: new Date().toISOString(),
      });

      const result = await getReputation(env.DB, agentId);
      expect(result?.feedback_count).toBe(20);
      expect(result?.average_score).toBe(90.0);
    });
  });
});

describe('Feedback queries', () => {
  describe('getRecentFeedback', () => {
    it('returns empty array for non-existent agent', async () => {
      const result = await getRecentFeedback(env.DB, 'nonexistent:1', 10);
      expect(result).toEqual([]);
    });

    it('returns feedback for existing agent', async () => {
      const agentId = '11155111:fb1';
      await insertMockFeedback(agentId);

      const result = await getRecentFeedback(env.DB, agentId, 10);
      expect(result.length).toBe(1);
      expect(result[0].agent_id).toBe(agentId);
    });

    it('respects limit', async () => {
      const agentId = '11155111:fb2';
      await insertMockFeedback(agentId, { score: 80 });
      await insertMockFeedback(agentId, { score: 70 });
      await insertMockFeedback(agentId, { score: 60 });

      const result = await getRecentFeedback(env.DB, agentId, 2);
      expect(result.length).toBe(2);
    });
  });

  describe('getAllFeedback', () => {
    it('returns all feedback for agent', async () => {
      const agentId = '11155111:fball';
      await insertMockFeedback(agentId, { score: 80 });
      await insertMockFeedback(agentId, { score: 70 });
      await insertMockFeedback(agentId, { score: 60 });

      const result = await getAllFeedback(env.DB, agentId);
      expect(result.length).toBe(3);
    });
  });

  describe('insertFeedback', () => {
    it('inserts feedback and returns id', async () => {
      const agentId = '11155111:fbinsert';
      const id = await insertFeedback(env.DB, {
        agent_id: agentId,
        chain_id: 11155111,
        score: 85,
        tags: '["reliable"]',
        context: 'Test feedback',
        submitter: '0x1234567890123456789012345678901234567890',
        submitted_at: new Date().toISOString(),
      });

      expect(id).toBeDefined();
      expect(id.length).toBe(32);

      const feedback = await getRecentFeedback(env.DB, agentId, 1);
      expect(feedback.length).toBe(1);
      expect(feedback[0].score).toBe(85);
    });
  });

  describe('feedbackExistsByEasUid', () => {
    it('returns false for non-existent EAS UID', async () => {
      const exists = await feedbackExistsByEasUid(env.DB, 'nonexistent-uid');
      expect(exists).toBe(false);
    });

    it('returns true for existing EAS UID', async () => {
      const easUid = 'existing-eas-uid-123';
      await insertMockFeedback('11155111:fbeas', { eas_uid: easUid });

      const exists = await feedbackExistsByEasUid(env.DB, easUid);
      expect(exists).toBe(true);
    });
  });

  describe('getFeedbackCount', () => {
    it('returns 0 for agent with no feedback', async () => {
      const count = await getFeedbackCount(env.DB, 'nonexistent:1');
      expect(count).toBe(0);
    });

    it('returns correct count', async () => {
      const agentId = '11155111:fbcount';
      await insertMockFeedback(agentId);
      await insertMockFeedback(agentId);
      await insertMockFeedback(agentId);

      const count = await getFeedbackCount(env.DB, agentId);
      expect(count).toBe(3);
    });
  });
});

describe('EAS sync state queries', () => {
  describe('getEasSyncState', () => {
    it('returns null for non-existent chain', async () => {
      const result = await getEasSyncState(env.DB, 99999);
      expect(result).toBeNull();
    });
  });

  describe('updateEasSyncState', () => {
    it('inserts new sync state', async () => {
      await updateEasSyncState(env.DB, 11155111, 1000, '2024-01-01T00:00:00Z', 50, null);

      const result = await getEasSyncState(env.DB, 11155111);
      expect(result).not.toBeNull();
      expect(result?.last_block).toBe(1000);
      expect(result?.attestations_synced).toBe(50);
    });

    it('updates existing sync state and increments attestations', async () => {
      await updateEasSyncState(env.DB, 84532, 500, '2024-01-01T00:00:00Z', 20, null);
      await updateEasSyncState(env.DB, 84532, 600, '2024-01-02T00:00:00Z', 30, null);

      const result = await getEasSyncState(env.DB, 84532);
      expect(result?.last_block).toBe(600);
      expect(result?.attestations_synced).toBe(50); // 20 + 30
    });

    it('stores error message', async () => {
      await updateEasSyncState(env.DB, 80002, 100, null, 0, 'Connection failed');

      const result = await getEasSyncState(env.DB, 80002);
      expect(result?.last_error).toBe('Connection failed');
    });
  });
});
