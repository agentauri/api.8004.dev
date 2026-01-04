/**
 * Trust Graph Service
 *
 * Builds a trust graph from feedback data and computes PageRank scores.
 * Higher PageRank = agent is trusted by well-connected wallets.
 *
 * Algorithm:
 * 1. Build edges from agent_feedback (wallet → agent)
 * 2. Weight edges by feedback score (1-5 → 0.2-1.0)
 * 3. Run PageRank with damping factor 0.85
 * 4. Normalize scores to 0-100 range
 *
 * @module services/trust-graph
 */

import type { D1Database } from '@cloudflare/workers-types';

/**
 * Trust edge between wallet and agent
 */
export interface TrustEdge {
  fromWallet: string;
  toAgentId: string;
  weight: number;
}

/**
 * Agent trust score
 */
export interface AgentTrustScore {
  agentId: string;
  chainId: number;
  trustScore: number; // 0-100 normalized
  rawPagerank: number;
  inDegree: number;
  computedAt: string | null;
}

/**
 * PageRank computation result
 */
export interface PageRankResult {
  totalAgents: number;
  totalEdges: number;
  iterations: number;
  converged: boolean;
  computationTimeMs: number;
}

/**
 * Trust graph state
 */
export interface TrustGraphState {
  lastComputation: string | null;
  totalIterations: number;
  totalEdges: number;
  totalAgents: number;
  dampingFactor: number;
  status: 'idle' | 'computing' | 'completed' | 'failed';
  error: string | null;
}

/**
 * Raw edge row from D1
 */
interface EdgeRow {
  from_wallet: string;
  to_agent_id: string;
  weight: number;
}

/**
 * Raw score row from D1
 */
interface ScoreRow {
  agent_id: string;
  chain_id: number;
  trust_score: number;
  raw_pagerank: number;
  in_degree: number;
  computed_at: string | null;
}

/**
 * Raw state row from D1
 */
interface StateRow {
  last_computation: string | null;
  total_iterations: number;
  total_edges: number;
  total_agents: number;
  damping_factor: number;
  status: string;
  error: string | null;
}

/**
 * Trust Graph Service
 */
export class TrustGraphService {
  private readonly dampingFactor = 0.85;
  private readonly maxIterations = 100;
  private readonly convergenceThreshold = 0.0001;

  constructor(private readonly db: D1Database) {}

  /**
   * Get current trust graph state
   */
  async getState(): Promise<TrustGraphState> {
    const row = await this.db
      .prepare('SELECT * FROM trust_graph_state WHERE id = ?')
      .bind('global')
      .first<StateRow>();

    if (!row) {
      return {
        lastComputation: null,
        totalIterations: 0,
        totalEdges: 0,
        totalAgents: 0,
        dampingFactor: this.dampingFactor,
        status: 'idle',
        error: null,
      };
    }

    return {
      lastComputation: row.last_computation,
      totalIterations: row.total_iterations,
      totalEdges: row.total_edges,
      totalAgents: row.total_agents,
      dampingFactor: row.damping_factor,
      status: row.status as TrustGraphState['status'],
      error: row.error,
    };
  }

  /**
   * Get trust score for an agent
   */
  async getTrustScore(agentId: string): Promise<AgentTrustScore | null> {
    const row = await this.db
      .prepare('SELECT * FROM agent_trust_scores WHERE agent_id = ?')
      .bind(agentId)
      .first<ScoreRow>();

    if (!row) return null;

    return {
      agentId: row.agent_id,
      chainId: row.chain_id,
      trustScore: row.trust_score,
      rawPagerank: row.raw_pagerank,
      inDegree: row.in_degree,
      computedAt: row.computed_at,
    };
  }

  /**
   * Get trust scores for multiple agents
   */
  async getTrustScoresBatch(agentIds: string[]): Promise<Map<string, AgentTrustScore>> {
    if (agentIds.length === 0) return new Map();

    const scores = new Map<string, AgentTrustScore>();

    // D1 has a limit of 100 bound parameters per query
    const BATCH_SIZE = 95;

    for (let i = 0; i < agentIds.length; i += BATCH_SIZE) {
      const batch = agentIds.slice(i, i + BATCH_SIZE);
      const placeholders = batch.map(() => '?').join(',');

      const { results } = await this.db
        .prepare(`SELECT * FROM agent_trust_scores WHERE agent_id IN (${placeholders})`)
        .bind(...batch)
        .all<ScoreRow>();

      for (const row of results) {
        scores.set(row.agent_id, {
          agentId: row.agent_id,
          chainId: row.chain_id,
          trustScore: row.trust_score,
          rawPagerank: row.raw_pagerank,
          inDegree: row.in_degree,
          computedAt: row.computed_at,
        });
      }
    }

    return scores;
  }

  /**
   * Get top trusted agents
   */
  async getTopTrustedAgents(limit = 100): Promise<AgentTrustScore[]> {
    const { results } = await this.db
      .prepare(
        `SELECT * FROM agent_trust_scores
         WHERE trust_score > 0
         ORDER BY trust_score DESC
         LIMIT ?`
      )
      .bind(limit)
      .all<ScoreRow>();

    return results.map((row) => ({
      agentId: row.agent_id,
      chainId: row.chain_id,
      trustScore: row.trust_score,
      rawPagerank: row.raw_pagerank,
      inDegree: row.in_degree,
      computedAt: row.computed_at,
    }));
  }

  /**
   * Build trust edges from feedback data
   * Converts feedback scores (1-5) to edge weights (0.2-1.0)
   */
  async buildEdgesFromFeedback(): Promise<number> {
    // Get all non-revoked feedback
    const { results: feedbackRows } = await this.db
      .prepare(
        `SELECT id, agent_id, submitter, score
         FROM agent_feedback
         WHERE score IS NOT NULL`
      )
      .all<{ id: string; agent_id: string; submitter: string; score: number }>();

    if (feedbackRows.length === 0) return 0;

    let edgesCreated = 0;

    // Process in batches to avoid hitting D1 limits
    const batchSize = 100;
    for (let i = 0; i < feedbackRows.length; i += batchSize) {
      const batch = feedbackRows.slice(i, i + batchSize);

      for (const feedback of batch) {
        // Normalize score from 1-5 to 0.2-1.0
        // Score 1 = 0.2, Score 5 = 1.0
        const weight = 0.2 + ((feedback.score - 1) / 4) * 0.8;

        const edgeId = `${feedback.submitter}:${feedback.agent_id}`;

        await this.db
          .prepare(
            `INSERT INTO trust_edges (id, from_wallet, to_agent_id, weight, feedback_id, updated_at)
             VALUES (?, ?, ?, ?, ?, datetime('now'))
             ON CONFLICT(from_wallet, to_agent_id) DO UPDATE SET
               weight = MAX(weight, ?),
               feedback_id = ?,
               updated_at = datetime('now')`
          )
          .bind(
            edgeId,
            feedback.submitter.toLowerCase(),
            feedback.agent_id,
            weight,
            feedback.id,
            weight,
            feedback.id
          )
          .run();

        edgesCreated++;
      }
    }

    return edgesCreated;
  }

  /**
   * Run PageRank algorithm on the trust graph
   */
  async computePageRank(): Promise<PageRankResult> {
    const startTime = Date.now();

    // Mark as computing
    await this.db
      .prepare(
        `UPDATE trust_graph_state
         SET status = 'computing', updated_at = datetime('now')
         WHERE id = 'global'`
      )
      .run();

    try {
      // Get all edges
      const { results: edges } = await this.db
        .prepare('SELECT from_wallet, to_agent_id, weight FROM trust_edges')
        .all<EdgeRow>();

      if (edges.length === 0) {
        await this.updateState('completed', 0, 0, 0);
        return {
          totalAgents: 0,
          totalEdges: 0,
          iterations: 0,
          converged: true,
          computationTimeMs: Date.now() - startTime,
        };
      }

      // Build graph structures
      const agents = new Set<string>();
      const wallets = new Set<string>();
      const incomingEdges = new Map<string, Array<{ from: string; weight: number }>>();
      const outDegree = new Map<string, number>();

      for (const edge of edges) {
        agents.add(edge.to_agent_id);
        wallets.add(edge.from_wallet);

        if (!incomingEdges.has(edge.to_agent_id)) {
          incomingEdges.set(edge.to_agent_id, []);
        }
        incomingEdges.get(edge.to_agent_id)?.push({
          from: edge.from_wallet,
          weight: edge.weight,
        });

        outDegree.set(edge.from_wallet, (outDegree.get(edge.from_wallet) ?? 0) + 1);
      }

      const agentList = Array.from(agents);
      const n = agentList.length;

      // Initialize PageRank scores
      let scores = new Map<string, number>();
      const initialScore = 1.0 / n;
      for (const agent of agentList) {
        scores.set(agent, initialScore);
      }

      // Wallet scores (initially uniform)
      const walletScores = new Map<string, number>();
      for (const wallet of wallets) {
        walletScores.set(wallet, 1.0);
      }

      // Iterate until convergence
      let iterations = 0;
      let converged = false;

      while (iterations < this.maxIterations && !converged) {
        const newScores = new Map<string, number>();
        let maxDiff = 0;

        for (const agent of agentList) {
          const incoming = incomingEdges.get(agent) ?? [];

          // Calculate new score
          let sum = 0;
          for (const edge of incoming) {
            const fromOutDegree = outDegree.get(edge.from) ?? 1;
            const walletScore = walletScores.get(edge.from) ?? 1.0;
            sum += (walletScore * edge.weight) / fromOutDegree;
          }

          const newScore = (1 - this.dampingFactor) / n + this.dampingFactor * sum;
          newScores.set(agent, newScore);

          const diff = Math.abs(newScore - (scores.get(agent) ?? 0));
          maxDiff = Math.max(maxDiff, diff);
        }

        scores = newScores;
        iterations++;

        if (maxDiff < this.convergenceThreshold) {
          converged = true;
        }
      }

      // Normalize scores to 0-100
      let maxScore = 0;
      for (const score of scores.values()) {
        maxScore = Math.max(maxScore, score);
      }

      // Save scores to database
      const now = new Date().toISOString();

      for (const [agentId, rawScore] of scores) {
        const normalizedScore = maxScore > 0 ? (rawScore / maxScore) * 100 : 0;
        const inDegree = incomingEdges.get(agentId)?.length ?? 0;
        const chainId = Number.parseInt(agentId.split(':')[0] ?? '0', 10);

        await this.db
          .prepare(
            `INSERT INTO agent_trust_scores
             (agent_id, chain_id, trust_score, raw_pagerank, in_degree, iteration, computed_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
             ON CONFLICT(agent_id) DO UPDATE SET
               trust_score = ?,
               raw_pagerank = ?,
               in_degree = ?,
               iteration = ?,
               computed_at = ?,
               updated_at = datetime('now')`
          )
          .bind(
            agentId,
            chainId,
            normalizedScore,
            rawScore,
            inDegree,
            iterations,
            now,
            normalizedScore,
            rawScore,
            inDegree,
            iterations,
            now
          )
          .run();
      }

      // Update state
      await this.updateState('completed', edges.length, agentList.length, iterations);

      return {
        totalAgents: agentList.length,
        totalEdges: edges.length,
        iterations,
        converged,
        computationTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.db
        .prepare(
          `UPDATE trust_graph_state
           SET status = 'failed', error = ?, updated_at = datetime('now')
           WHERE id = 'global'`
        )
        .bind(message)
        .run();

      throw error;
    }
  }

  /**
   * Full rebuild: build edges from feedback then compute PageRank
   */
  async rebuildTrustGraph(): Promise<PageRankResult & { edgesBuilt: number }> {
    const edgesBuilt = await this.buildEdgesFromFeedback();
    const result = await this.computePageRank();
    return { ...result, edgesBuilt };
  }

  /**
   * Update trust graph state
   */
  private async updateState(
    status: string,
    totalEdges: number,
    totalAgents: number,
    totalIterations: number
  ): Promise<void> {
    await this.db
      .prepare(
        `UPDATE trust_graph_state
         SET status = ?,
             total_edges = ?,
             total_agents = ?,
             total_iterations = ?,
             last_computation = datetime('now'),
             error = NULL,
             updated_at = datetime('now')
         WHERE id = 'global'`
      )
      .bind(status, totalEdges, totalAgents, totalIterations)
      .run();
  }
}

/**
 * Create a trust graph service instance
 */
export function createTrustGraphService(db: D1Database): TrustGraphService {
  return new TrustGraphService(db);
}
