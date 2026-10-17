export function parse(args, names, extraFlags = []) {
  const out = {}, flags = new Set(['--json', '--no-color', ...extraFlags]);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (flags.has(arg)) out[arg] = true;
    else if (names.includes(arg)) { const value = args[++i]; if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`); out[arg] = value; }
    else throw new Error(`unknown option: ${arg}`);
  }
  return out;
}
export function integer(options, key, fallback, max) {
  if (options[key] === undefined) return fallback;
  const raw = options[key]; if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > max) throw new Error(`${key} must be an integer from 0 to ${max}`);
  return Number(raw);
}
export function decimal(options, key, fallback) {
  if (options[key] === undefined) return fallback;
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(options[key])) throw new Error(`${key} requires a decimal number`);
  const value = Number(options[key]); if (!Number.isFinite(value)) throw new Error(`${key} must be finite`); return value;
}
export async function terminal({ live, frames = Infinity, onKey, onTick, draw, interval = () => 80 }) {
  let running = true, dirty = true;
  const input = data => { for (const key of data.toString()) { if (key === 'q' || key === '\x03') running = false; else { onKey(key); dirty = true; } } };
  const stop = () => { running = false; }; let restore = () => {};
  try {
    if (live) {
      const wasRaw = process.stdin.isRaw; process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.on('data', input); process.on('SIGINT', stop); process.on('SIGTERM', stop);
      restore = () => { process.stdin.off('data', input); process.stdin.setRawMode(!!wasRaw); process.stdin.pause(); process.off('SIGINT', stop); process.off('SIGTERM', stop); process.stdout.write('\x1b[?25h\x1b[?1049l'); };
      process.stdout.write('\x1b[?1049h\x1b[?25l');
    }
    for (let frame = 0; running && frame < (live ? frames : Math.min(frames, 1)); frame++) {
      if (frame > 0 && onTick()) dirty = true;
      if (dirty) { const text = draw(); process.stdout.write(live ? `\x1b[H\x1b[J${text}\n` : `${text}\n`); dirty = false; }
      if (live && running && frame + 1 < frames) await new Promise(resolve => setTimeout(resolve, interval()));
    }
  } finally { restore(); }
}
