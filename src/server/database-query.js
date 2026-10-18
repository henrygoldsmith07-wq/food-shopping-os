/**
 * The Mongo-shaped query language the Redis document store speaks: filters,
 * projections, updates and the date encoding documents are stored with.
 * Pure functions; `database.js` owns the Redis side.
 */

export const householdIdFrom = (...values) => {
  for (const value of values) {
    if (!value || typeof value !== 'object') continue;
    const id = value.householdId || value.$set?.householdId || value.$setOnInsert?.householdId;
    if (id !== undefined && id !== null) return id.toString();
  }
  return null;
};

export const encode = (value) => {
  if (value instanceof Date) return { $forqDate: value.toISOString() };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
  }
  return value;
};

export const decode = (value) => {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && typeof value.$forqDate === 'string') {
      return new Date(value.$forqDate);
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]));
  }
  return value;
};

export const serialise = (document) => JSON.stringify(encode(document));
export const deserialise = (value) => {
  if (value === null || value === undefined) return null;
  return decode(typeof value === 'string' ? JSON.parse(value) : value);
};

export const comparable = (value) => {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === 'object' && typeof value.toString === 'function') return value.toString();
  return value;
};
export const valueAt = (document, path) =>
  path.split('.').reduce((value, part) => (value === null || value === undefined ? undefined : value[part]), document);

export const setAt = (document, path, value) => {
  const parts = path.split('.');
  let target = document;
  for (const part of parts.slice(0, -1)) {
    if (!target[part] || typeof target[part] !== 'object') target[part] = {};
    target = target[part];
  }
  target[parts.at(-1)] = value;
};

export const unsetAt = (document, path) => {
  const parts = path.split('.');
  const target = parts.slice(0, -1).reduce((value, part) => value?.[part], document);
  if (target && typeof target === 'object') delete target[parts.at(-1)];
};

export const valuesEqual = (left, right) => {
  if (Array.isArray(left) && !Array.isArray(right)) return left.some((item) => valuesEqual(item, right));
  return comparable(left) === comparable(right);
};

export const expressionValue = (document, expression) => {
  if (typeof expression === 'string' && expression.startsWith('$')) return valueAt(document, expression.slice(1));
  if (!expression || typeof expression !== 'object' || Array.isArray(expression)) return expression;
  if ('$ifNull' in expression) {
    const [candidate, fallback] = expression.$ifNull;
    return expressionValue(document, candidate) ?? expressionValue(document, fallback);
  }
  if ('$add' in expression) {
    return expression.$add.reduce((sum, item) => sum + Number(expressionValue(document, item) || 0), 0);
  }
  return expression;
};

export const matchesCondition = (actual, condition) => {
  if (!condition || typeof condition !== 'object' || condition instanceof Date || Array.isArray(condition)) {
    return valuesEqual(actual, condition);
  }
  return Object.entries(condition).every(([operator, expected]) => {
    if (operator === '$in') return expected.some((item) => valuesEqual(actual, item));
    if (operator === '$exists') return (actual !== undefined) === expected;
    if (operator === '$ne') return !valuesEqual(actual, expected);
    if (operator === '$gt') return comparable(actual) > comparable(expected);
    if (operator === '$gte') return comparable(actual) >= comparable(expected);
    if (operator === '$lt') return comparable(actual) < comparable(expected);
    if (operator === '$lte') return comparable(actual) <= comparable(expected);
    return false;
  });
};

export const matches = (document, filter = {}) => Object.entries(filter).every(([field, condition]) => {
  if (field === '$expr') {
    if ('$lte' in condition) {
      const [left, right] = condition.$lte;
      return comparable(expressionValue(document, left)) <= comparable(expressionValue(document, right));
    }
    return false;
  }
  if (field === '$or') return condition.some((item) => matches(document, item));
  if (field === '$and') return condition.every((item) => matches(document, item));
  return matchesCondition(valueAt(document, field), condition);
});

export const project = (document, projection) => {
  if (!projection) return document;
  const included = Object.entries(projection).filter(([, enabled]) => enabled).map(([field]) => field);
  if (!included.length) {
    const copy = structuredClone(document);
    for (const [field, enabled] of Object.entries(projection)) {
      if (!enabled) delete copy[field];
    }
    return copy;
  }
  const result = {};
  if (projection._id !== 0 && document._id !== undefined) result._id = document._id;
  for (const field of included.filter((item) => item !== '_id')) {
    const value = valueAt(document, field);
    if (value !== undefined) setAt(result, field, value);
  }
  return result;
};

export const baseDocument = (filter) => Object.fromEntries(
  Object.entries(filter).filter(([field, value]) =>
    !field.startsWith('$')
    && (!value || typeof value !== 'object' || value instanceof Date || Array.isArray(value))),
);

export const applyUpdate = (document, update, inserting = false) => {
  const next = structuredClone(document);
  if (inserting) {
    for (const [field, value] of Object.entries(update.$setOnInsert || {})) setAt(next, field, value);
  }
  for (const [field, value] of Object.entries(update.$set || {})) setAt(next, field, value);
  for (const field of Object.keys(update.$unset || {})) unsetAt(next, field);
  for (const [field, amount] of Object.entries(update.$inc || {})) {
    setAt(next, field, Number(valueAt(next, field) || 0) + Number(amount));
  }
  return next;
};

/** A Mongo-style cursor over a loader: filter, sort, limit, project. */
export class RedisCursor {
  constructor(load, filter, options = {}) {
    this.load = load;
    this.filter = filter;
    this.projection = options.projection;
    this.sortSpec = null;
    this.maximum = null;
  }

  sort(spec) {
    this.sortSpec = spec;
    return this;
  }

  limit(value) {
    this.maximum = value;
    return this;
  }

  /** Mongo's cursor.project(), which routes written against the driver call. */
  project(spec) {
    this.projection = spec;
    return this;
  }

  async toArray() {
    let documents = (await this.load()).filter((document) => matches(document, this.filter));
    if (this.sortSpec) {
      const fields = Object.entries(this.sortSpec);
      documents.sort((left, right) => {
        for (const [field, direction] of fields) {
          const a = comparable(valueAt(left, field));
          const b = comparable(valueAt(right, field));
          if (a < b) return -1 * direction;
          if (a > b) return direction;
        }
        return 0;
      });
    }
    if (this.maximum !== null) documents = documents.slice(0, this.maximum);
    return documents.map((document) => project(document, this.projection));
  }
}
