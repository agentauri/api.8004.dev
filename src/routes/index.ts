/**
 * Routes barrel export
 * @module routes
 */

// Use Qdrant-based implementations for agents and search
export { agents } from './agents-qdrant';
export { chains } from './chains';
export { classify } from './classify';
export { compose } from './compose';
export { evaluate } from './evaluate';
export { events } from './events';
export { health } from './health';
export { intents } from './intents';
export { openapi } from './openapi';
export { reputation } from './reputation';
export { scripts } from './scripts';
export { search } from './search-qdrant';
export { searchStream } from './search-stream';
export { stats } from './stats';
export { taxonomy } from './taxonomy';
