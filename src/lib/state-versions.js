/**
 * Which shape of state this build writes and understands.
 *
 * Its own module, deliberately. The storage keys and the version number are
 * needed by the boot path — the code that decides where state comes from
 * before anything else has loaded — and the boot path must not have to pull in
 * the food catalogue, the recipe book or React to learn them.
 *
 * `STATE_VERSION` is bumped whenever the shape of a saved install changes, and
 * only then. A record from a *newer* version than this build understands is
 * never rewritten: it is reported so the recovery screen can offer it back to
 * the person who owns it.
 */

export const STORAGE_KEY = 'forq-state-v2';
export const STATE_VERSION = 4;
