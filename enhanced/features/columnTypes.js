import swig from 'free-swig';

/*
 * Which filter Type fits each field, read from the documents the collection page is showing. The Simple filter uses it to
 * switch its Type select when the Key typed matches a field. It only knows what is on screen: a field absent from this
 * page is unknown, and the filter keeps String for it.
 *
 * Types are the Simple filter's codes: N number, D date, O ObjectId, U UUID, S string. Booleans are S on purpose: the String
 * converter already matches both the text "true" and the boolean, which is what people mean.
 */

const MAX_DEPTH = 3;
const MAX_PATHS = 500;
const NUMBER_TYPES = new Set(['Int32', 'Double', 'Long', 'Decimal128']);

const scalarType = (value) => {
  if (typeof value === 'number') return 'N';
  if (typeof value === 'string' || typeof value === 'boolean') return 'S';
  if (value instanceof Date) return 'D';
  if (value?._bsontype === 'ObjectId') return 'O';
  if (value?._bsontype === 'Binary' && value.sub_type === 4) return 'U';
  if (NUMBER_TYPES.has(value?._bsontype)) return 'N';
  return null;
};

// Large values arrive as a display stub instead of the value (see viewCollection); they say nothing about the type.
const isStub = (value) => typeof value?.display === 'string' && value.display.startsWith('***');

const isPlainObject = (value) => value !== null && typeof value === 'object'
  && !Array.isArray(value) && !value._bsontype && !(value instanceof Date);

const visit = (value, path, depth, found) => {
  if (value === null || value === undefined || isStub(value)) return;
  if (found.size >= MAX_PATHS) return;
  const scalar = scalarType(value);
  if (scalar) {
    if (!found.has(path)) found.set(path, scalar);
    return;
  }
  // MongoDB's dot notation reaches into array elements, so a field holding an array is filtered by what its elements are.
  if (Array.isArray(value)) {
    for (const item of value) visit(item, path, depth, found);
    return;
  }
  if (isPlainObject(value) && depth < MAX_DEPTH) {
    for (const [name, child] of Object.entries(value)) visit(child, `${path}.${name}`, depth + 1, found);
  }
};

/** { path: 'N' | 'D' | 'O' | 'U' | 'S' }, the first value seen for a path deciding its type. */
export const columnTypes = (documents = []) => {
  const found = new Map();
  for (const document of documents) {
    if (!isPlainObject(document)) continue;
    for (const [name, value] of Object.entries(document)) visit(value, name, 1, found);
  }
  return Object.fromEntries(found);
};

/** Registers the filter the collection template uses; swig keeps filters in one shared registry, so this is global. */
export const registerColumnTypes = () => swig.setFilter('me_column_types', (documents) => JSON.stringify(columnTypes(documents)));
