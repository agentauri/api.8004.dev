/**
 * Routes barrel export
 * @module routes
 */

// Use Qdrant-based implementations for agents and search
export { agents } from './agents-qdrant';
export { search } from './search-qdrant';

export { chains } from './chains';
export { classify } from './classify';
export { health } from './health';
export { openapi } from './openapi';
export { reputation } from './reputation';
export { scripts } from './scripts';
export { stats } from './stats';
export { taxonomy } from './taxonomy';
