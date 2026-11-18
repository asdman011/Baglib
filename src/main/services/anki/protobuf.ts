/**
 * Baglib — a minimal protobuf reader for Anki's settings blobs (KEY-392).
 *
 * Schema-18 collections keep note-type, field, template, deck and deck-option settings as protobuf
 * messages (proto/anki/*.proto in Anki 26.09). BagLib only reads them, and only the fields it maps,
 * so a tiny wire-format reader is enough and no protobuf dependency is needed. Unknown fields are
 * skipped; repeated scalars are accepted both packed and unpacked, as the protobuf spec requires.
 */

export type ProtoValue = { wire: 0; value: bigint } | { wire: 1; value: Uint8Array } | { wire: 2; value: Uint8Array } | { wire: 5; value: Uint8Array };

/** All fields of one message, by field number, in wire order. */
export type ProtoMessage = Map<number, ProtoValue[]>;

const MAX_MESSAGE_BYTES = 64 * 1024 * 1024;

function readVarint(bytes: Uint8Array, start: number): { value: bigint; next: number } {
  let result = 0n;
  let shift = 0n;
  let pos = start;
  for (let i = 0; i < 10; i++) {
    if (pos >= bytes.length) throw new Error('anki-protobuf-truncated');
    const byte = bytes[pos++]!;
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value: result, next: pos };
    shift += 7n;
  }
  throw new Error('anki-protobuf-varint');
}

/** Parses one message level. Nested messages stay as bytes until asked for. */
export function parseProto(bytes: Uint8Array | null | undefined): ProtoMessage {
  const fields: ProtoMessage = new Map();
  if (!bytes || bytes.length === 0) return fields;
  if (bytes.length > MAX_MESSAGE_BYTES) throw new Error('anki-protobuf-too-large');
  let pos = 0;
  while (pos < bytes.length) {
    const key = readVarint(bytes, pos);
    pos = key.next;
    const fieldNumber = Number(key.value >> 3n);
    const wire = Number(key.value & 7n);
    let entry: ProtoValue;
    if (wire === 0) {
      const v = readVarint(bytes, pos);
      pos = v.next;
      entry = { wire: 0, value: v.value };
    } else if (wire === 1) {
      if (pos + 8 > bytes.length) throw new Error('anki-protobuf-truncated');
      entry = { wire: 1, value: bytes.subarray(pos, pos + 8) };
      pos += 8;
    } else if (wire === 2) {
      const len = readVarint(bytes, pos);
      pos = len.next;
      const n = Number(len.value);
      if (n < 0 || pos + n > bytes.length) throw new Error('anki-protobuf-truncated');
      entry = { wire: 2, value: bytes.subarray(pos, pos + n) };
      pos += n;
    } else if (wire === 5) {
      if (pos + 4 > bytes.length) throw new Error('anki-protobuf-truncated');
      entry = { wire: 5, value: bytes.subarray(pos, pos + 4) };
      pos += 4;
    } else {
      throw new Error(`anki-protobuf-wire-${wire}`);
    }
    const list = fields.get(fieldNumber);
    if (list) list.push(entry);
    else fields.set(fieldNumber, [entry]);
  }
  return fields;
}

const last = (msg: ProtoMessage, field: number): ProtoValue | undefined => {
  const list = msg.get(field);
  return list ? list[list.length - 1] : undefined;
};

export function protoUint(msg: ProtoMessage, field: number, fallback = 0): number {
  const v = last(msg, field);
  return v && v.wire === 0 ? Number(BigInt.asUintN(64, v.value)) : fallback;
}

/** int64 / int32 (two's complement varint). */
export function protoInt(msg: ProtoMessage, field: number, fallback = 0): number {
  const v = last(msg, field);
  return v && v.wire === 0 ? Number(BigInt.asIntN(64, v.value)) : fallback;
}

export function protoSint(msg: ProtoMessage, field: number, fallback = 0): number {
  const v = last(msg, field);
  if (!v || v.wire !== 0) return fallback;
  const n = BigInt.asUintN(64, v.value);
  return Number((n >> 1n) ^ -(n & 1n));
}

export function protoBool(msg: ProtoMessage, field: number, fallback = false): boolean {
  const v = last(msg, field);
  return v && v.wire === 0 ? v.value !== 0n : fallback;
}

export function protoHas(msg: ProtoMessage, field: number): boolean {
  return msg.has(field);
}

const utf8 = new TextDecoder('utf-8');

export function protoString(msg: ProtoMessage, field: number, fallback = ''): string {
  const v = last(msg, field);
  return v && v.wire === 2 ? utf8.decode(v.value) : fallback;
}

export function protoBytes(msg: ProtoMessage, field: number): Uint8Array | null {
  const v = last(msg, field);
  return v && v.wire === 2 ? v.value : null;
}

export function protoMessage(msg: ProtoMessage, field: number): ProtoMessage {
  return parseProto(protoBytes(msg, field));
}

export function protoMessages(msg: ProtoMessage, field: number): ProtoMessage[] {
  return (msg.get(field) ?? []).filter(v => v.wire === 2).map(v => parseProto(v.value));
}

const f32 = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, 4).getFloat32(0, true);

export function protoFloat(msg: ProtoMessage, field: number, fallback = 0): number {
  const v = last(msg, field);
  return v && v.wire === 5 ? f32(v.value) : fallback;
}

/** `repeated float`, packed (wire 2) or not (wire 5). */
export function protoFloats(msg: ProtoMessage, field: number): number[] {
  const out: number[] = [];
  for (const v of msg.get(field) ?? []) {
    if (v.wire === 5) out.push(f32(v.value));
    else if (v.wire === 2) for (let i = 0; i + 4 <= v.value.length; i += 4) out.push(f32(v.value.subarray(i, i + 4)));
  }
  return out;
}

/** `repeated uint32`, packed or not. */
export function protoUints(msg: ProtoMessage, field: number): number[] {
  const out: number[] = [];
  for (const v of msg.get(field) ?? []) {
    if (v.wire === 0) out.push(Number(BigInt.asUintN(64, v.value)));
    else if (v.wire === 2) {
      let pos = 0;
      while (pos < v.value.length) {
        const r = readVarint(v.value, pos);
        out.push(Number(r.value));
        pos = r.next;
      }
    }
  }
  return out;
}

/**
 * Anki's field and template ids are random 64-bit integers, beyond JavaScript's exact range. They
 * travel through BagLib as the marker string `__i64:<digits>` and are written back as bare JSON
 * numbers on export (stringifyAnkiJson), so no digit is ever rounded.
 */
export const I64_MARKER = '__i64:';

export function int64Json(value: bigint): number | string {
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : `${I64_MARKER}${value.toString()}`;
}

export function protoInt64(msg: ProtoMessage, field: number): number | string | null {
  const v = last(msg, field);
  return v && v.wire === 0 ? int64Json(BigInt.asIntN(64, v.value)) : null;
}

/** JSON.parse that keeps integers beyond 2^53 exact (as I64_MARKER strings). */
export function parseAnkiJson(text: string): unknown {
  return JSON.parse(text, (_key, value: unknown, context?: { source?: string }) =>
    typeof value === 'number' && !Number.isSafeInteger(value) && context?.source && /^-?\d+$/u.test(context.source)
      ? `${I64_MARKER}${context.source}`
      : value
  );
}

/** JSON.stringify that writes I64_MARKER strings back as bare integers. */
export function stringifyAnkiJson(value: unknown): string {
  return JSON.stringify(value).replace(/"__i64:(-?\d+)"/gu, '$1');
}

/** Rounds a float32 read back to the shortest decimal that round-trips (0.85 not 0.8500000238). */
export function tidyFloat(n: number): number {
  return Number.parseFloat(Math.fround(n).toPrecision(7));
}
