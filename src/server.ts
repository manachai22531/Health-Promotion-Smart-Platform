/**
 * Incremental TypeScript entrypoint.
 *
 * The legacy server remains the single runtime implementation during phase 1.
 * Keeping this import side-effect-only preserves every route, response and
 * database query while allowing the compiled entrypoint to be exercised now.
 */
import '../server.js';
