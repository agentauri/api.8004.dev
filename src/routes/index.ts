/**
 * Routes barrel export
 * @module routes
 */

// Use Qdrant-based implementations for agents and search
export { agents } from './agents-qdrant';
export { analytics } from './analytics';
export { chains } from './chains';
export { classify } from './classify';
export { compose } from './compose';
export { evaluate } from './evaluate';
export { evaluations } from './evaluations';
export { events } from './events';
export { feedbacks } from './feedbacks';
export { health } from './health';
export { intents } from './intents';
export { keys } from './keys';
export { leaderboard } from './leaderboard';
export { metadata } from './metadata';
export { openapi } from './openapi';
export { reputation } from './reputation';
export { scripts } from './scripts';
export { search } from './search-qdrant';
export { searchStream } from './search-stream';
export { stats } from './stats';
export { tags } from './tags';
export { taxonomy } from './taxonomy';
export { trending } from './trending';
export { validations } from './validations';
export { verification } from './verification';
