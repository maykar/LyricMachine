/**
 * API input validation schemas using Valibot.
 *
 * Usage in route handlers:
 *   const body = await parseBody(req)
 *   const { data, error } = validate(SongCreateSchema, body)
 *   if (error) return json(res, { error }, 400)
 */
import * as v from 'valibot'

// --- Shared field schemas ---
const Label = v.optional(v.picklist(['fresh', 'getting-there', 'in-setlist', 'ignored']))
const BoolInt = v.optional(v.union([
  v.boolean(),
  v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1)),
]))

// --- Song schemas ---

export const SongCreateSchema = v.object({
  title: v.pipe(v.string(), v.trim(), v.minLength(1, 'title required')),
  lyrics: v.optional(v.string(), ''),
  fontAdjust: v.optional(v.pipe(v.number(), v.integer())),
  merge: BoolInt,
  separators: BoolInt,
  altColors: BoolInt,
  label: Label,
  played: BoolInt,
  playCount: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  customChords: v.optional(v.nullable(v.union([v.string(), v.array(v.any())]))),
  customStructure: v.optional(v.string()),
  spotifyTrackId: v.optional(v.nullable(v.string())),
  albumArt: v.optional(v.nullable(v.string())),
  capo: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(12)))),
  notInPlaylist: BoolInt,
})

export const SongUpdateSchema = v.partial(SongCreateSchema)

export const ReorderSchema = v.object({
  ids: v.pipe(v.array(v.pipe(v.number(), v.integer(), v.minValue(1))), v.minLength(1, 'ids array required')),
})

const BULK_FIELDS = ['played', 'playCount', 'fontAdjust', 'merge', 'separators', 'altColors', 'label']
export const BulkUpdateSchema = v.object({
  field: v.picklist(BULK_FIELDS, 'invalid field'),
  value: v.union([v.string(), v.number(), v.boolean(), v.null()]),
})

export const ImportSchema = v.pipe(
  v.array(v.object({
    title: v.pipe(v.string(), v.trim(), v.minLength(1)),
    lyrics: v.optional(v.string()),
    fontAdjust: v.optional(v.pipe(v.number(), v.integer())),
    merge: v.optional(v.pipe(v.number(), v.integer())),
    separators: v.optional(v.pipe(v.number(), v.integer())),
    altColors: v.optional(v.pipe(v.number(), v.integer())),
    label: v.optional(v.string()),
    played: v.optional(v.pipe(v.number(), v.integer())),
    playCount: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
    customChords: v.optional(v.nullable(v.string())),
    customStructure: v.optional(v.string()),
    spotifyTrackId: v.optional(v.nullable(v.string())),
    albumArt: v.optional(v.nullable(v.string())),
    capo: v.optional(v.nullable(v.pipe(v.number(), v.integer()))),
    notInPlaylist: v.optional(v.pipe(v.number(), v.integer())),
    sortOrder: v.optional(v.pipe(v.number(), v.integer())),
  })),
  v.minLength(1, 'expected non-empty array'),
)

/**
 * Validate data against a schema.
 * Returns { data } on success, { error } on failure.
 */
export function validate(schema, data) {
  const result = v.safeParse(schema, data)
  if (result.success) return { data: result.output }

  // Build a human-readable error from the first issue
  const issue = result.issues[0]
  const path = issue.path?.map(p => p.key).join('.') || ''
  const msg = path ? `${path}: ${issue.message}` : issue.message
  return { error: msg }
}
