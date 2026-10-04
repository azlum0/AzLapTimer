const FILE_MAP_READ = 0x0004;
const MEMORY_BASIC_INFORMATION_SIZE = 48;
const REGION_SIZE_OFFSET = 24;

const SYMBOLS = {
  OpenFileMappingA: { parameters: ['u32', 'i32', 'buffer'], result: 'pointer' },
  MapViewOfFile: { parameters: ['pointer', 'u32', 'u32', 'u32', 'usize'], result: 'pointer' },
  VirtualQuery: { parameters: ['pointer', 'buffer', 'usize'], result: 'usize' },
  UnmapViewOfFile: { parameters: ['pointer'], result: 'i32' },
  CloseHandle: { parameters: ['pointer'], result: 'i32' },
} as const;

let kernel32: Deno.DynamicLibrary<typeof SYMBOLS> | null = null;

export interface Mapping {
  /** a live window onto the sim's memory, not a copy */
  view: DataView;
  close(): void;
}

/** Opens a named shared memory block read-only. Null when no process has created it. */
export function openMapping(name: string): Mapping | null {
  if (Deno.build.os !== 'windows') return null;
  kernel32 ??= Deno.dlopen('kernel32.dll', SYMBOLS);
  const k = kernel32.symbols;

  const handle = k.OpenFileMappingA(FILE_MAP_READ, 0, new TextEncoder().encode(`${name}\0`));
  if (handle === null) return null;
  const base = k.MapViewOfFile(handle, FILE_MAP_READ, 0, 0, 0n);
  if (base === null) {
    k.CloseHandle(handle);
    return null;
  }

  const info = new Uint8Array(MEMORY_BASIC_INFORMATION_SIZE);
  const wrote = k.VirtualQuery(base, info, BigInt(info.length));
  const size = wrote ? Number(new DataView(info.buffer).getBigUint64(REGION_SIZE_OFFSET, true)) : 0;
  if (size <= 0) {
    k.UnmapViewOfFile(base);
    k.CloseHandle(handle);
    return null;
  }

  const view = new DataView(Deno.UnsafePointerView.getArrayBuffer(base, size));
  let open = true;
  return {
    view,
    close() {
      if (!open) return;
      open = false;
      k.UnmapViewOfFile(base);
      k.CloseHandle(handle);
    },
  };
}

const CONSOLE_SYMBOLS = {
  GetConsoleProcessList: { parameters: ['buffer', 'u32'], result: 'u32' },
  FreeConsole: { parameters: [], result: 'i32' },
} as const;

/**
 * The desktop app starts the extension without asking windows to keep it windowless, so windows
 * opens an empty console window for it. Nothing is ever written there, since the host owns all
 * three streams, so let go of the console and the window closes.
 *
 * Only a console this process has to itself is dropped: under the dev server the console is the
 * terminal the developer is typing in.
 */
export function releaseOwnConsole(): boolean {
  if (Deno.build.os !== 'windows') return false;
  const lib = Deno.dlopen('kernel32.dll', CONSOLE_SYMBOLS);
  try {
    const attached = new Uint32Array(4);
    const count = lib.symbols.GetConsoleProcessList(new Uint8Array(attached.buffer), attached.length);
    return count === 1 && lib.symbols.FreeConsole() !== 0;
  } finally {
    lib.close();
  }
}
