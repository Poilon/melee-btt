// Slippi's UBJSON envelope and documented events, plus a namespaced browser
// input stream. Exact playback uses that stream and the pinned WASM build;
// Dolphin playback of native-browser recordings is not claimed.
// https://github.com/project-slippi/slippi-wiki/blob/master/SPEC.md
export const MAX_REPLAY_BYTES = 12 * 1024 * 1024;
export const MAX_REPLAY_FRAMES = 36000;
export const stageIds = [
  34, 36, 39, 56, 41, 42, 43, 44, 33, 45, 46, 47, 48, 50, 40, 51, 52, 54, 55,
  55, 38, 35, 37, 57, 49, 58,
];
const encoder = new TextEncoder(),
  decoder = new TextDecoder("utf-8", { fatal: true });
const sizes = new Map([
  [0x36, 0x2bd],
  [0x3a, 12],
  [0x37, 0x42],
  [0x38, 0x25],
  [0x3c, 8],
  [0x39, 2],
]);
function event(command) {
  const b = new Uint8Array(1 + sizes.get(command));
  b[0] = command;
  return [b, new DataView(b.buffer)];
}
function join(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
function i32(n) {
  const b = new Uint8Array(5);
  b[0] = 0x6c;
  new DataView(b.buffer).setInt32(1, n);
  return b;
}
function key(s) {
  const b = encoder.encode(s);
  return join([
    b.length < 256 ? Uint8Array.of(0x55, b.length) : i32(b.length),
    b,
  ]);
}
function ubjson(v) {
  if (v instanceof Uint8Array)
    return join([Uint8Array.of(0x5b, 0x24, 0x55, 0x23), i32(v.length), v]);
  if (typeof v === "string") return join([Uint8Array.of(0x53), key(v)]);
  if (typeof v === "boolean") return Uint8Array.of(v ? 0x54 : 0x46);
  if (Number.isSafeInteger(v)) return i32(v);
  if (v === null) return Uint8Array.of(0x5a);
  return join([
    Uint8Array.of(0x7b),
    ...Object.entries(v).flatMap(([k, x]) => [key(k), ubjson(x)]),
    Uint8Array.of(0x7d),
  ]);
}
// Bounded, deliberately small UBJSON reader; never execute data from a replay.
function readUbjson(bytes) {
  let at = 0,
    nodes = 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const take = (n) => {
    if (!Number.isSafeInteger(n) || n < 0 || at + n > bytes.length)
      throw Error("Truncated replay.");
    const b = bytes.subarray(at, at + n);
    at += n;
    return b;
  };
  const byte = () => take(1)[0];
  function number(type = byte()) {
    if (type === 0x55) return byte();
    if (type === 0x69) {
      const n = byte();
      return n > 127 ? n - 256 : n;
    }
    if (type === 0x6c) {
      take(4);
      return view.getInt32(at - 4);
    }
    throw Error("Unsupported replay encoding.");
  }
  const string = () => decoder.decode(take(number()));
  function value(depth = 0) {
    if (depth > 12 || ++nodes > 2000)
      throw Error("Replay metadata is too complex.");
    const t = byte();
    if (t === 0x53) return string();
    if (t === 0x54) return true;
    if (t === 0x46) return false;
    if (t === 0x5a) return null;
    if ([0x55, 0x69, 0x6c].includes(t)) return number(t);
    if (t === 0x5b) {
      if (byte() !== 0x24 || byte() !== 0x55 || byte() !== 0x23)
        throw Error("Unsupported replay array.");
      return take(number());
    }
    if (t === 0x7b) {
      const obj = Object.create(null);
      while (bytes[at] !== 0x7d) {
        const k = string();
        if (Object.hasOwn(obj, k)) throw Error("Duplicate replay field.");
        obj[k] = value(depth + 1);
      }
      byte();
      return obj;
    }
    throw Error("Unsupported replay metadata.");
  }
  const result = value();
  if (at !== bytes.length) throw Error("Unexpected replay data.");
  return result;
}
const seedOf = (s) => ((s[18] << 16) | s[17]) >>> 0;
export class BttRecorder {
  constructor({
    fighter,
    engine,
    seed = 1234567,
    startAt = new Date().toISOString(),
    name = "",
  }) {
    if (
      !Number.isInteger(fighter) ||
      !stageIds[fighter] ||
      !/^[a-f0-9]{64}$/.test(engine)
    )
      throw Error("Invalid replay settings.");
    Object.assign(this, {
      fighter,
      engine,
      seed,
      startAt,
      name,
      parts: [],
      inputs: [],
      ucfEnabled: [],
      checks: [],
      count: 0,
      practice: false,
      overflow: false,
    });
  }
  static fromReplay(replay, frame, state, name = "") {
    const events = replay.frameEvents(frame);
    const recorder = new BttRecorder({
      fighter: replay.fighter,
      engine: replay.engine,
      seed: replay.seed,
      name,
    });
    recorder.parts = [events];
    recorder.inputs = Array.from(replay.inputs.subarray(0, frame * 10));
    recorder.ucfEnabled = Array.from({ length: frame }, (_, i) =>
      Number(replay.ucf(i)),
    );
    recorder.checks = [replay.checks.slice(0, frame * 6)];
    recorder.count = frame;
    recorder.practice = true;
    recorder.last = state.slice();
    return recorder;
  }
  record(pad, before, after, cstick, ucf = true) {
    if (this.count >= MAX_REPLAY_FRAMES) {
      this.overflow = true;
      return;
    }
    const frame = this.count - 123;
    this.count++;
    this.practice ||= !!cstick;
    this.inputs.push(...pad, Number(!!cstick));
    this.ucfEnabled.push(Number(!!ucf));
    const check = new Uint8Array(6),
      cv = new DataView(check.buffer);
    cv.setUint16(0, after[8]);
    cv.setUint32(2, after[10]);
    this.checks.push(check);
    let [b, v] = event(0x3a);
    v.setInt32(1, frame);
    v.setUint32(5, seedOf(before));
    v.setUint32(9, this.count - 1);
    this.parts.push(b);
    [b, v] = event(0x37);
    v.setInt32(1, frame);
    v.setUint32(7, seedOf(before));
    v.setUint16(11, before[5]);
    v.setFloat32(13, before[1]);
    v.setFloat32(17, before[2]);
    v.setFloat32(21, before[7]);
    for (let i = 0; i < 4; i++)
      v.setFloat32(
        25 + i * 4,
        Math.max(-1, Math.min(1, (pad[3 + i] - 128) / 80)),
      );
    v.setFloat32(41, Math.max(pad[7], pad[8]) / 255);
    v.setUint32(45, (pad[1] << 8) | pad[2]);
    v.setUint16(49, (pad[1] << 8) | pad[2]);
    v.setFloat32(51, pad[7] / 255);
    v.setFloat32(55, pad[8] / 255);
    v.setInt8(59, pad[3] - 128);
    v.setFloat32(60, before[3]);
    v.setInt8(64, pad[4] - 128);
    v.setInt8(65, pad[5] - 128);
    v.setInt8(66, pad[6] - 128);
    this.parts.push(b);
    [b, v] = event(0x38);
    v.setInt32(1, frame);
    b[7] = after[0];
    v.setUint16(8, after[5]);
    v.setFloat32(10, after[1]);
    v.setFloat32(14, after[2]);
    v.setFloat32(18, after[7]);
    v.setFloat32(22, after[3]);
    b[33] = after[4];
    v.setFloat32(34, after[6]);
    this.parts.push(b);
    [b, v] = event(0x3c);
    v.setInt32(1, frame);
    v.setInt32(5, frame);
    this.parts.push(b);
    this.last = after.slice();
  }
  finish({ complete = false, practice = this.practice } = {}) {
    if (this.overflow)
      throw Error(
        "Replay exceeds ten minutes. Restart to record a shorter attempt.",
      );
    if (!this.count) throw Error("No replay recorded yet.");
    const table = Uint8Array.of(
      0x35,
      sizes.size * 3 + 1,
      ...[...sizes].flatMap(([c, n]) => [c, n >> 8, n & 255]),
    );
    const [start, v] = event(0x36);
    start.set([3, 17, 0, 0], 1);
    start[5] = 3;
    start[6] = 2;
    start[16] = 255;
    v.setUint16(0x13, stageIds[this.fighter]);
    v.setFloat32(0x35, 1);
    for (let i = 0; i < 4; i++) {
      const p = 0x65 + 36 * i;
      start[p] = i ? 0 : this.fighter;
      start[p + 1] = i ? 3 : 0;
      start[p + 2] = 1;
      start[p + 8] = 9;
      for (const off of [0x18, 0x1c, 0x20]) v.setFloat32(p + off, 1);
      v.setUint32(0x141 + 8 * i, this.ucfEnabled[0]);
      v.setUint32(0x145 + 8 * i, this.ucfEnabled[0]);
    }
    v.setUint32(0x13d, this.seed);
    start[0x1a3] = 2;
    start[0x1a4] = 15;
    start[0x2bd] = 1;
    const [end] = event(0x39);
    end[1] = complete ? 3 : 7;
    end[2] = 255;
    const raw = join([table, start, ...this.parts, end]);
    const metadata = {
      startAt: this.startAt,
      lastFrame: this.count - 124,
      playedOn: "melee-browser",
      players: {
        0: {
          names: { netplay: this.name.slice(0, 24) },
          characters: { [this.last[0]]: this.count },
        },
      },
      meleeBrowser: {
        version: 2,
        ucfEnabled: Uint8Array.from(this.ucfEnabled),
        engine: this.engine,
        fighter: this.fighter,
        seed: this.seed,
        frames: this.last[10],
        complete: !!complete,
        practice: !!practice,
        inputs: Uint8Array.from(this.inputs),
        checks: join(this.checks),
      },
    };
    return ubjson({ raw, metadata });
  }
}
export function parseBttReplay(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length > MAX_REPLAY_BYTES) throw Error("Replay exceeds 12 MB.");
  const root = readUbjson(bytes),
    m = root.metadata,
    b = m?.meleeBrowser;
  if (!b || ![1, 2].includes(b.version))
    throw Error(
      "Open a .slp recorded by Browser BTT. Dolphin/Slippi recordings are not supported by this player yet.",
    );
  if (
    !Number.isInteger(b.fighter) ||
    !stageIds[b.fighter] ||
    !/^[a-f0-9]{64}$/.test(b.engine) ||
    b.seed !== 1234567 ||
    typeof b.complete !== "boolean" ||
    typeof b.practice !== "boolean"
  )
    throw Error("Invalid replay settings.");
  if (
    !(b.inputs instanceof Uint8Array) ||
    !(b.checks instanceof Uint8Array) ||
    !b.inputs.length ||
    b.inputs.length % 10
  )
    throw Error("Invalid replay inputs.");
  const count = b.inputs.length / 10;
  if (
    count > MAX_REPLAY_FRAMES ||
    b.checks.length !== count * 6 ||
    m.lastFrame !== count - 124
  )
    throw Error("Invalid replay length.");
  if (
    b.version === 2 &&
    (!(b.ucfEnabled instanceof Uint8Array) ||
      b.ucfEnabled.length !== count ||
      b.ucfEnabled.some((v) => v > 1))
  )
    throw Error("Invalid replay UCF settings.");
  const ucf = (i) => b.version === 1 || !!b.ucfEnabled[i];
  const checks = new DataView(
    b.checks.buffer,
    b.checks.byteOffset,
    b.checks.length,
  );
  let lastTime = 0,
    lastTargets = 10,
    practice = false;
  for (let i = 0; i < count; i++) {
    const p = b.inputs.subarray(i * 10, i * 10 + 10),
      targets = checks.getUint16(i * 6),
      time = checks.getUint32(i * 6 + 2);
    if (
      p[0] !== 1 ||
      p[9] > 1 ||
      targets > lastTargets ||
      time < lastTime ||
      time > lastTime + 1
    )
      throw Error("Invalid replay timeline.");
    practice ||= !!p[9];
    lastTime = time;
    lastTargets = targets;
  }
  if (
    (practice && !b.practice) ||
    !Number.isSafeInteger(b.frames) ||
    b.frames !== lastTime ||
    (b.complete && (lastTargets !== 0 || b.frames <= 0))
  )
    throw Error("Invalid replay result.");
  // Require a consistent Slippi event stream as well as the browser extension.
  const raw = root.raw;
  if (
    !(raw instanceof Uint8Array) ||
    raw[0] !== 0x35 ||
    raw[1] !== sizes.size * 3 + 1
  )
    throw Error("Invalid Slippi event table.");
  let at = 2;
  for (const [c, n] of sizes) {
    if (raw[at++] !== c || raw[at++] !== n >> 8 || raw[at++] !== (n & 255))
      throw Error("Invalid Slippi event sizes.");
  }
  const readEvent = (c) => {
    const n = 1 + sizes.get(c);
    if (raw[at] !== c || at + n > raw.length)
      throw Error("Invalid Slippi event sequence.");
    const v = new DataView(raw.buffer, raw.byteOffset + at, n);
    at += n;
    return v;
  };
  const start = readEvent(0x36);
  if (
    start.getUint16(0x13) !== stageIds[b.fighter] ||
    start.getUint8(0x65) !== b.fighter ||
    start.getUint32(0x13d) !== b.seed ||
    start.getUint8(0x1a4) !== 15
  )
    throw Error("Replay settings mismatch.");
  if (
    start.getUint32(0x141) !== Number(ucf(0)) ||
    start.getUint32(0x145) !== Number(ucf(0))
  )
    throw Error("Replay UCF settings mismatch.");
  const frameStart = at;
  const frameBytes = [0x3a, 0x37, 0x38, 0x3c].reduce(
    (n, c) => n + 1 + sizes.get(c),
    0,
  );
  const posts = [];
  for (let i = 0; i < count; i++)
    for (const c of [0x3a, 0x37, 0x38, 0x3c]) {
      const v = readEvent(c);
      if (v.getInt32(1) !== i - 123) throw Error("Replay frame mismatch.");
      if (c === 0x38) {
        const p = [
          v.getUint8(7),
          v.getFloat32(10),
          v.getFloat32(14),
          v.getFloat32(22),
          v.getUint8(33),
          v.getUint16(8),
          v.getFloat32(34),
          v.getFloat32(18),
        ];
        if (!p.every(Number.isFinite)) throw Error("Invalid replay state.");
        posts.push(p);
      }
    }
  const end = readEvent(0x39);
  if (end.getUint8(1) !== (b.complete ? 3 : 7) || at !== raw.length)
    throw Error("Invalid replay ending.");
  return {
    ...b,
    count,
    startAt: m.startAt,
    name: m.players?.["0"]?.names?.netplay || "",
    posts,
    ucf,
    frameEvents(frame) {
      if (!Number.isSafeInteger(frame) || frame < 1 || frame > count)
        throw Error("Invalid replay branch frame.");
      return raw.slice(frameStart, frameStart + frame * frameBytes);
    },
    pad(i) {
      return Array.from(this.inputs.subarray(i * 10, i * 10 + 9));
    },
    cstick(i) {
      return !!this.inputs[i * 10 + 9];
    },
    matches(i, state) {
      const p = posts[i];
      return (
        p.every((v, j) => Math.abs(v - state[j]) < 0.001) &&
        checks.getUint16(i * 6) === state[8] &&
        checks.getUint32(i * 6 + 2) === state[10]
      );
    },
  };
}
