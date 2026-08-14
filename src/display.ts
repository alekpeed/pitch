/**
 * Whether a drill's answers can safely be title-cased for display.
 *
 * They cannot when they are Roman numerals: case *is* the notation there — vi is
 * a minor chord and VI is a major one — so capitalising "ii7 – V7 – Imaj7" into
 * "Ii7 – V7 – Imaj7" states something musically false. Only a set of plain
 * lowercase words ("major", "half diminished") is safe to touch, so the styling
 * is opted into per drill rather than applied to every answer grid.
 */
export const titleCasable = (options: readonly string[]) => options.every(option => /^[a-z][a-z ]*$/.test(option));
