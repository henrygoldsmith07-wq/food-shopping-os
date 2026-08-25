/**
 * One way to read a quantity, for the whole app.
 *
 * This is the front door and stays the only import anyone needs. The work is
 * in two halves next to it: `measure-parse.js` turns text into a measurement,
 * and `measure-ops.js` does arithmetic on the results.
 *
 * The rules the module keeps are documented in `measure-parse.js`: mass and
 * volume never silently mix, a package size is only exact when we know that
 * package for that ingredient, and text it cannot read returns null.
 */

export * from './measure-parse.js';
export * from './measure-ops.js';
