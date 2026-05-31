import { redis } from './index.js';

export const contextCache = {
  setContext: async (key: string, data: any) => {
    if (redis.status !== 'ready') {
      console.log('[Cache] Redis not ready, skipping set');
      return;
    }
    try {
      await redis.set(key, JSON.stringify(data), 'EX', 900); // 15 min TTL
      console.log(`[Cache] Stored: ${key} (expires 900s)`);
    } catch (error) {
      console.error('[Cache] Set error:', error);
    }
  },

  getContext: async (key: string) => {
    if (redis.status !== 'ready') {return null;}
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('[Cache] Get error:', error);
      return null;
    }
  },

  /**
   * Delete a specific cache key (used for cross-case invalidation).
   */
  deleteContext: async (key: string) => {
    if (redis.status !== 'ready') {return;}
    try {
      await redis.del(key);
      console.log(`[Cache] Busted: ${key}`);
    } catch (error) {
      console.error('[Cache] Delete error:', error);
    }
  },

  /**
   * Bidirectional cache bust for a user after a live webhook event.
   *
   * WHY this is needed:
   *   - Case 1 (global) and Case 2 (specific repo) use DIFFERENT cache keys.
   *   - When a PR is merged and only one case is active, the other case's
   *     cache goes stale. This busts both so switching between cases always
   *     shows fresh data after a live event.
   *
   * Call this BEFORE the new data is written (not after).
   *
   * @param userId  - the user whose caches to bust
   * @param repo    - the affected repo key (e.g. "amanshaikh90/contextos")
   *                  pass '' or omit to bust only the global cache
   */
  bustLiveUpdate: async (userId: string, repo?: string) => {
    if (redis.status !== 'ready') {return;}

    const keysToDelete: string[] = [];

    // Always bust the global (Case 1) cache
    keysToDelete.push(`context:${userId}:none`);

    // Also bust the specific-repo (Case 2) cache if we know which repo changed
    if (repo && repo.trim() !== '' && repo.toLowerCase() !== 'none') {
      const repoKey = repo.trim().toLowerCase();
      keysToDelete.push(`context:${userId}:${repoKey}`);

      // Also bust by short name (e.g. "contextos" as well as "amanshaikh90/contextos")
      const shortName = repoKey.includes('/') ? repoKey.split('/').pop()! : repoKey;
      if (shortName !== repoKey) {
        keysToDelete.push(`context:${userId}:${shortName}`);
      }
    }

    try {
      if (keysToDelete.length > 0) {
        await redis.del(...keysToDelete);
        console.log(`[Cache] Live bust for userId=${userId}: ${keysToDelete.join(', ')}`);
      }
    } catch (error) {
      console.error('[Cache] Bust error:', error);
    }
  },
};
