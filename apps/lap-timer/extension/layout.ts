export type Prim = 'u8' | 'i8' | 'bool' | 'u16' | 'i16' | 'u32' | 'i32' | 'f32' | 'u64' | 'i64' | 'f64' | 'ptr';

const SIZES: Record<Prim, number> = {
  u8: 1,
  i8: 1,
  bool: 1,
  u16: 2,
  i16: 2,
  u32: 4,
  i32: 4,
  f32: 4,
  u64: 8,
  i64: 8,
  f64: 8,
  ptr: 8,
};

export interface Layout {
  size: number;
  align: number;
  /** byte offset of every named field */
  at: Record<string, number>;
}

/** a name starting with an underscore is padding the reader never looks at */
export type Field = readonly [name: string, type: Prim | Layout, count?: number];

/**
 * Lays a C struct out the way the 64-bit Windows compiler does, so a reader can name the fields
 * in header order and get their offsets, instead of carrying numbers worked out by hand.
 */
export function struct(fields: readonly Field[], pack = 8): Layout {
  const at: Record<string, number> = {};
  let offset = 0;
  let align = 1;
  for (const [name, type, count = 1] of fields) {
    const size = typeof type === 'string' ? SIZES[type] : type.size;
    const natural = typeof type === 'string' ? SIZES[type] : type.align;
    const fieldAlign = Math.min(natural, pack);
    offset = Math.ceil(offset / fieldAlign) * fieldAlign;
    if (!name.startsWith('_')) at[name] = offset;
    offset += size * count;
    if (fieldAlign > align) align = fieldAlign;
  }
  return { size: Math.ceil(offset / align) * align, align, at };
}

const utf8 = new TextDecoder();
const latin1 = new TextDecoder('windows-1252');

/** a fixed-size char array, read up to its terminator */
export function cstr(view: DataView, offset: number, max: number, encoding: 'utf8' | 'latin1' = 'utf8'): string {
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, max);
  const end = bytes.indexOf(0);
  // decode a copy: the memory behind the view belongs to the sim and may change mid-read
  const text = (encoding === 'utf8' ? utf8 : latin1).decode(bytes.slice(0, end < 0 ? max : end));
  return text.trim();
}
