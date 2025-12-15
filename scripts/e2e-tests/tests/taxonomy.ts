/**
 * Taxonomy Tests
 * Tests for GET /taxonomy endpoint (OASF taxonomy)
 */

import { describe, it } from '../test-runner';
import { get } from '../utils/api-client';
import { assertSuccess } from '../utils/assertions';

interface TaxonomyItem {
  slug: string;
  name: string;
  description?: string;
}

interface TaxonomyResponse {
  skills?: TaxonomyItem[];
  domains?: TaxonomyItem[];
  version?: string;
}

export function registerTaxonomyTests(): void {
  describe('Taxonomy Endpoint', () => {
    it('GET /taxonomy returns skills and domains', async () => {
      const { json } = await get<TaxonomyResponse>('/taxonomy');
      assertSuccess(json);

      const data = json.data as TaxonomyResponse;
      if (!data.skills || !data.domains) {
        throw new Error('Expected both skills and domains in taxonomy');
      }
      if (!Array.isArray(data.skills)) {
        throw new Error('Expected skills to be an array');
      }
      if (!Array.isArray(data.domains)) {
        throw new Error('Expected domains to be an array');
      }
      if (data.skills.length === 0) {
        throw new Error('Expected at least some skills');
      }
      if (data.domains.length === 0) {
        throw new Error('Expected at least some domains');
      }
    });

    it('GET /taxonomy?type=skill returns only skills', async () => {
      const { json } = await get<TaxonomyResponse>('/taxonomy', { type: 'skill' });
      assertSuccess(json);

      const data = json.data as TaxonomyResponse;
      if (!data.skills || !Array.isArray(data.skills)) {
        throw new Error('Expected skills array');
      }
      if (data.skills.length === 0) {
        throw new Error('Expected at least some skills');
      }
    });

    it('GET /taxonomy?type=domain returns only domains', async () => {
      const { json } = await get<TaxonomyResponse>('/taxonomy', { type: 'domain' });
      assertSuccess(json);

      const data = json.data as TaxonomyResponse;
      if (!data.domains || !Array.isArray(data.domains)) {
        throw new Error('Expected domains array');
      }
      if (data.domains.length === 0) {
        throw new Error('Expected at least some domains');
      }
    });

    it('GET /taxonomy has version field', async () => {
      const { json } = await get<TaxonomyResponse>('/taxonomy');
      assertSuccess(json);

      const data = json.data as TaxonomyResponse;
      if (typeof data.version !== 'string') {
        throw new Error('Expected version to be a string');
      }
      // Version should follow semver-like format (e.g., "0.8.0")
      if (!/^\d+\.\d+\.\d+/.test(data.version)) {
        throw new Error(`Expected semver-like version, got: ${data.version}`);
      }
    });

    it('Taxonomy items have slug and name', async () => {
      const { json } = await get<TaxonomyResponse>('/taxonomy');
      assertSuccess(json);

      const data = json.data as TaxonomyResponse;

      // Check skills structure
      if (data.skills) {
        for (const skill of data.skills) {
          if (typeof skill.slug !== 'string' || !skill.slug) {
            throw new Error('Skill missing slug');
          }
          if (typeof skill.name !== 'string' || !skill.name) {
            throw new Error(`Skill ${skill.slug} missing name`);
          }
        }
      }

      // Check domains structure
      if (data.domains) {
        for (const domain of data.domains) {
          if (typeof domain.slug !== 'string' || !domain.slug) {
            throw new Error('Domain missing slug');
          }
          if (typeof domain.name !== 'string' || !domain.name) {
            throw new Error(`Domain ${domain.slug} missing name`);
          }
        }
      }
    });
  });
}
