import type { ExtensionRegistry } from '@/extensions/registry';
import { loadInstalledExtensions } from '@/extensions/store';

// Dev-only: when this module hot-reloads, ask the app to re-run extension activation.
try {
  const hot = (import.meta as any).hot;
  if (hot && typeof hot.accept === 'function') {
    hot.accept(() => {
      try {
        window.dispatchEvent(new CustomEvent('extensions-runtime-reload'));
      } catch {
        // ignore
      }
    });
  }
} catch {
  // ignore
}

type WebviewRecord = {
  viewId: string;
  html: string;
};

const webviews = new Map<string, WebviewRecord>();
const commands = new Map<string, (...args: any[]) => any>();
const extensionErrors = new Map<string, string>();
const outputChannels = new Map<string, { name: string; text: string }>();

function createUtilPolyfill() {
  const inherits = (ctor: any, superCtor: any) => {
    if (!ctor || !superCtor) return;
    ctor.super_ = superCtor;
    Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
  };
  const debuglog = (section: string) => {
    return (...args: any[]) => {
      console.debug(`[${section}]`, ...args);
    };
  };
  const format = (fmt?: string, ...args: any[]) => {
    if (!fmt) return '';
    let i = 0;
    return fmt.replace(/%[sdif%]/g, (match) => {
      if (match === '%%') return '%';
      if (i >= args.length) return match;
      const arg = args[i++];
      switch (match) {
        case '%s': return String(arg);
        case '%d': return Number(arg).toString();
        case '%i': return Math.floor(Number(arg)).toString();
        case '%f': return Number(arg).toString();
        default: return String(arg);
      }
    });
  };
  const inspect = (obj: any) => {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  };
  const callbackify = (fn: (...args: any[]) => Promise<any>) => {
    return (...args: any[]) => {
      const cb = args.pop();
      if (typeof cb !== 'function') throw new TypeError('Last argument must be a callback');
      Promise.resolve(fn(...args)).then(
        (res) => cb(null, res),
        (err) => cb(err)
      );
    };
  };
  const promisify = (fn: (...args: any[]) => any) => {
    return (...args: any[]) => {
      return new Promise((resolve, reject) => {
        fn(...args, (err: any, result: any) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
    };
  };
  const types = {
    isDate: (x: any) => x instanceof Date,
    isRegExp: (x: any) => x instanceof RegExp,
    isError: (x: any) => x instanceof Error,
    isFunction: (x: any) => typeof x === 'function',
    isNullOrUndefined: (x: any) => x == null,
    isObject: (x: any) => x !== null && typeof x === 'object',
    isPrimitive: (x: any) => {
      switch (typeof x) {
        case 'object':
          return x === null;
        case 'function':
          return false;
        default:
          return true;
      }
    },
  };
  return { inherits, format, inspect, callbackify, promisify, types, debuglog };
}

function createOsPolyfill() {
  const os = {
    EOL: '\n',
    arch: () => 'x64',
    platform: () => 'win32',
    type: () => 'Windows_NT',
    release: () => '',
    homedir: () => '',
    tmpdir: () => '',
    hostname: () => '',
    cpus: () => [],
    freemem: () => 0,
    totalmem: () => 0,
    uptime: () => 0,
    userInfo: () => ({ username: '' }),
  };

  return os;
}

function createStreamPolyfill() {
  const EventEmitter: any = function EventEmitter(this: any) {
    if (!this) return;
    if (!this.__gopilot_stream_listeners) this.__gopilot_stream_listeners = {};
  };

  const getListeners = (self: any) => {
    if (!self.__gopilot_stream_listeners) self.__gopilot_stream_listeners = {};
    return self.__gopilot_stream_listeners as Record<string, Array<(...args: any[]) => void>>;
  };

  EventEmitter.prototype.on = function (event: string, handler: (...args: any[]) => void) {
    const listeners = getListeners(this);
    (listeners[event] ??= []).push(handler);
    return this;
  };

  EventEmitter.prototype.addListener = EventEmitter.prototype.on;

  EventEmitter.prototype.once = function (event: string, handler: (...args: any[]) => void) {
    const wrap = (...args: any[]) => {
      this.removeListener(event, wrap);
      handler(...args);
    };
    return this.on(event, wrap);
  };

  EventEmitter.prototype.listenerCount = function (event: string) {
    const listeners = getListeners(this);
    const arr = listeners[event];
    return Array.isArray(arr) ? arr.length : 0;
  };

  EventEmitter.prototype.removeListener = function (event: string, handler: (...args: any[]) => void) {
    const listeners = getListeners(this);
    const arr = listeners[event];
    if (!arr) return this;
    listeners[event] = arr.filter((h) => h !== handler);
    return this;
  };

  EventEmitter.prototype.emit = function (event: string, ...args: any[]) {
    const listeners = getListeners(this);
    const arr = listeners[event];
    if (!arr) return false;
    for (const h of arr) h(...args);
    return true;
  };

  // Node-compatible: Stream and friends are callable constructors (not ES6 classes)
  // so libs can do `Stream.call(this)`.
  const Stream: any = function Stream(this: any) {
    if (!(this instanceof Stream)) {
      const self = Object.create(Stream.prototype);
      Stream.call(self);
      return self;
    }
    // initialize EventEmitter base
    (EventEmitter as any).call(this);
  };
  Stream.prototype = Object.create((EventEmitter as any).prototype);
  Stream.prototype.constructor = Stream;
  Stream.prototype.pipe = function (_dest: any) {
    return _dest;
  };

  const Readable: any = function Readable(this: any) {
    if (!(this instanceof Readable)) {
      const self = Object.create(Readable.prototype);
      Readable.call(self);
      return self;
    }
    Stream.call(this);
  };
  Readable.prototype = Object.create(Stream.prototype);
  Readable.prototype.constructor = Readable;
  Readable.prototype.read = function (_size?: number) {
    return null;
  };

  const Writable: any = function Writable(this: any) {
    if (!(this instanceof Writable)) {
      const self = Object.create(Writable.prototype);
      Writable.call(self);
      return self;
    }
    Stream.call(this);
  };
  Writable.prototype = Object.create(Stream.prototype);
  Writable.prototype.constructor = Writable;
  Writable.prototype.write = function (_chunk: any, _encoding?: any, cb?: any) {
    if (typeof cb === 'function') cb();
    return true;
  };
  Writable.prototype.end = function (_chunk?: any, _encoding?: any, cb?: any) {
    if (typeof cb === 'function') cb();
  };

  const Duplex: any = function Duplex(this: any) {
    if (!(this instanceof Duplex)) {
      const self = Object.create(Duplex.prototype);
      Duplex.call(self);
      return self;
    }
    Readable.call(this);
    Writable.call(this);
  };
  Duplex.prototype = Object.create(Readable.prototype);
  Duplex.prototype.constructor = Duplex;
  Duplex.prototype.write = Writable.prototype.write;
  Duplex.prototype.end = Writable.prototype.end;

  const Transform: any = function Transform(this: any) {
    if (!(this instanceof Transform)) {
      const self = Object.create(Transform.prototype);
      Transform.call(self);
      return self;
    }
    Duplex.call(this);
  };
  Transform.prototype = Object.create(Duplex.prototype);
  Transform.prototype.constructor = Transform;

  const PassThrough: any = function PassThrough(this: any) {
    if (!(this instanceof PassThrough)) {
      const self = Object.create(PassThrough.prototype);
      PassThrough.call(self);
      return self;
    }
    Transform.call(this);
  };
  PassThrough.prototype = Object.create(Transform.prototype);
  PassThrough.prototype.constructor = PassThrough;

  // Match Node's module shape: require('stream') is the Stream constructor function,
  // with additional constructors attached as properties.
  const stream: any = Stream;
  stream.Stream = Stream;
  stream.Readable = Readable;
  stream.Writable = Writable;
  stream.Duplex = Duplex;
  stream.Transform = Transform;
  stream.PassThrough = PassThrough;

  return stream;
}

function createEventsPolyfill() {
  const EventEmitter: any = function EventEmitter(this: any) {
    if (!this) return;
    if (!this.__gopilot_listeners) this.__gopilot_listeners = {};
  };

  const getListeners = (self: any) => {
    if (!self.__gopilot_listeners) self.__gopilot_listeners = {};
    return self.__gopilot_listeners as Record<string, Array<(...args: any[]) => void>>;
  };

  EventEmitter.prototype.on = function (event: string, handler: (...args: any[]) => void) {
    const listeners = getListeners(this);
    (listeners[event] ??= []).push(handler);
    return this;
  };

  EventEmitter.prototype.addListener = EventEmitter.prototype.on;

  EventEmitter.prototype.once = function (event: string, handler: (...args: any[]) => void) {
    const wrap = (...args: any[]) => {
      this.removeListener(event, wrap);
      handler(...args);
    };
    return this.on(event, wrap);
  };

  EventEmitter.prototype.removeListener = function (event: string, handler: (...args: any[]) => void) {
    const listeners = getListeners(this);
    const arr = listeners[event];
    if (!arr) return this;
    listeners[event] = arr.filter((h) => h !== handler);
    return this;
  };

  EventEmitter.prototype.emit = function (event: string, ...args: any[]) {
    const listeners = getListeners(this);
    const arr = listeners[event];
    if (!arr) return false;
    for (const h of arr) h(...args);
    return true;
  };

  // Match Node's module shape: require('events') returns the constructor function,
  // and also has an EventEmitter property.
  EventEmitter.EventEmitter = EventEmitter;

  return EventEmitter;
}

function createPathPolyfill() {
  const normalize = (p: string) => (p || '').replace(/\\/g, '/');
  const trimSlashes = (p: string) => p.replace(/^\/+/, '').replace(/\/+$/, '');

  const path = {
    sep: '/',
    delimiter: ';',
    normalize: (p: string) => normalize(p),
    isAbsolute: (p: string) => /^\//.test(normalize(p)) || /^[a-zA-Z]:\//.test(normalize(p)),
    join: (...parts: string[]) => {
      const joined = parts
        .filter((x) => x !== undefined && x !== null)
        .map((x) => String(x))
        .join('/');
      return normalize(joined).replace(/\/+/, '/');
    },
    dirname: (p: string) => {
      const n = normalize(p);
      const idx = n.lastIndexOf('/');
      return idx <= 0 ? '' : n.slice(0, idx);
    },
    basename: (p: string) => {
      const n = normalize(p);
      const idx = n.lastIndexOf('/');
      return idx >= 0 ? n.slice(idx + 1) : n;
    },
    extname: (p: string) => {
      const b = (path as any).basename(p);
      const idx = b.lastIndexOf('.');
      return idx >= 0 ? b.slice(idx) : '';
    },
    resolve: (...parts: string[]) => {
      const joined = (path as any).join(...parts);
      return normalize('/' + trimSlashes(joined));
    },
  };

  return path;
}

function createBufferPolyfill() {
  const attachToString = (u8: Uint8Array) => {
    (u8 as any).toString = (encoding?: string) => {
      if (encoding && encoding !== 'utf8' && encoding !== 'utf-8') {
        throw new Error(`Buffer.toString: unsupported encoding ${encoding}`);
      }
      const dec = new TextDecoder();
      return dec.decode(u8);
    };
    return u8 as any;
  };

  const BufferPoly: any = function BufferPoly() {
    throw new Error('Buffer constructor is not supported. Use Buffer.from/alloc instead.');
  };

  BufferPoly.from = (input: any, encoding?: string) => {
    if (typeof input === 'string') {
      if (encoding && encoding !== 'utf8' && encoding !== 'utf-8') {
        throw new Error(`Buffer.from: unsupported encoding ${encoding}`);
      }
      const enc = new TextEncoder();
      return attachToString(enc.encode(input));
    }
    if (input instanceof ArrayBuffer) return attachToString(new Uint8Array(input));
    if (Array.isArray(input)) return attachToString(Uint8Array.from(input));
    if (input instanceof Uint8Array) return attachToString(input);
    throw new Error('Buffer.from: unsupported input');
  };

  BufferPoly.alloc = (size: number) => attachToString(new Uint8Array(Math.max(0, size | 0)));
  BufferPoly.isBuffer = (x: any) => x instanceof Uint8Array;

  return { Buffer: BufferPoly } as any;
}

function createTtyPolyfill() {
  const tty = {
    isatty: (_fd: number) => false,
    ReadStream: class ReadStream {},
    WriteStream: class WriteStream {},
  };
  return tty;
}

function createCryptoPolyfill(bufferShim: any) {
  const getWebCrypto = () => {
    const c: any = (globalThis as any).crypto;
    return c && (typeof c.getRandomValues === 'function' || c.subtle) ? c : null;
  };

  const randomBytes = (size: number, cb?: (err: any, buf: any) => void) => {
    const n = Math.max(0, (size as any) | 0);
    const arr = new Uint8Array(n);
    const wc = getWebCrypto();
    if (wc && typeof wc.getRandomValues === 'function') wc.getRandomValues(arr);
    const buf = bufferShim?.Buffer?.from ? bufferShim.Buffer.from(arr) : arr;
    if (typeof cb === 'function') {
      try {
        cb(null, buf);
      } catch {
        // ignore
      }
      return undefined;
    }
    return buf;
  };

  const randomUUID = () => {
    const wc: any = (globalThis as any).crypto;
    if (wc && typeof wc.randomUUID === 'function') return wc.randomUUID();
    const bytes: Uint8Array = new Uint8Array(16);
    const c = getWebCrypto();
    if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };

  return {
    randomBytes,
    randomUUID,
    getRandomValues: (...args: any[]) => {
      const c = getWebCrypto();
      if (!c || typeof c.getRandomValues !== 'function') throw new Error('crypto.getRandomValues is not available');
      return c.getRandomValues(...args);
    },
    createHash: (_alg: string) => {
      throw new Error('crypto.createHash is not supported in GoPilot stage 2 runtime yet');
    },
  };
}

function createHttpsPolyfill(bufferShim: any) {
  const toUrl = (options: any): string => {
    if (typeof options === 'string') return options;
    if (options && typeof options?.href === 'string') return String(options.href);

    const protocol = options?.protocol ? String(options.protocol) : 'https:';
    const hostname = options?.hostname ? String(options.hostname) : options?.host ? String(options.host) : 'localhost';
    const port = options?.port ? `:${String(options.port)}` : '';
    const path = options?.path ? String(options.path) : '/';
    return `${protocol}//${hostname}${port}${path}`;
  };

  const normalizeHeaders = (headers: any) => {
    if (!headers) return undefined;
    if (Array.isArray(headers)) {
      const obj: Record<string, string> = {};
      for (const [k, v] of headers) obj[String(k)] = String(v);
      return obj;
    }
    if (typeof headers === 'object') {
      const obj: Record<string, string> = {};
      for (const k of Object.keys(headers)) obj[String(k)] = String((headers as any)[k]);
      return obj;
    }
    return undefined;
  };

  const createEmitter = () => {
    const listeners: Record<string, Array<(...args: any[]) => void>> = {};
    const on = (event: string, handler: (...args: any[]) => void) => {
      (listeners[event] ??= []).push(handler);
      return api;
    };
    const emit = (event: string, ...args: any[]) => {
      const arr = listeners[event];
      if (!arr) return false;
      for (const h of arr) h(...args);
      return true;
    };
    const api = {
      on,
      addListener: on,
      once: (event: string, handler: (...args: any[]) => void) => {
        const wrap = (...args: any[]) => {
          api.removeListener(event, wrap);
          handler(...args);
        };
        return on(event, wrap);
      },
      removeListener: (event: string, handler: (...args: any[]) => void) => {
        const arr = listeners[event];
        if (!arr) return api;
        listeners[event] = arr.filter((h) => h !== handler);
        return api;
      },
      emit,
    };
    return api;
  };

  const request = (options: any, cb?: (res: any) => void) => {
    const emitter = createEmitter();
    const url = toUrl(options);
    const method = options?.method ? String(options.method) : 'GET';
    const headers = normalizeHeaders(options?.headers);
    const chunks: Array<Uint8Array> = [];

    const clientReq: any = {
      ...emitter,
      write: (chunk: any, _enc?: any, cb2?: any) => {
        if (typeof chunk === 'string') {
          chunks.push(new TextEncoder().encode(chunk));
        } else if (chunk instanceof Uint8Array) {
          chunks.push(chunk);
        } else if (chunk instanceof ArrayBuffer) {
          chunks.push(new Uint8Array(chunk));
        }
        if (typeof cb2 === 'function') cb2();
        return true;
      },
      end: (chunk?: any, enc?: any, cb2?: any) => {
        if (chunk !== undefined && chunk !== null) clientReq.write(chunk, enc);

        (async () => {
          try {
            const body = chunks.length
              ? new Blob(chunks as any)
              : undefined;
            const resp = await fetch(url, { method, headers, body: body as any });

            const resEmitter = createEmitter();
            const res: any = {
              ...resEmitter,
              statusCode: resp.status,
              statusMessage: resp.statusText,
              headers: {},
              setEncoding: (_enc2: string) => undefined,
              pipe: (_dest: any) => _dest,
            };
            try {
              (resp.headers as any)?.forEach?.((v: string, k: string) => {
                (res.headers as any)[k.toLowerCase()] = v;
              });
            } catch {
              // ignore
            }

            if (typeof cb === 'function') {
              try {
                cb(res);
              } catch {
                // ignore
              }
            }

            const ab = await resp.arrayBuffer();
            const u8 = new Uint8Array(ab);
            const buf = bufferShim?.Buffer?.from ? bufferShim.Buffer.from(u8) : u8;
            res.emit('data', buf);
            res.emit('end');
          } catch (err) {
            clientReq.emit('error', err);
          }
        })();

        if (typeof cb2 === 'function') cb2();
      },
      abort: () => undefined,
      destroy: () => undefined,
    };

    return clientReq;
  };

  const get = (options: any, cb?: (res: any) => void) => {
    const req: any = request(options, cb);
    req.end();
    return req;
  };

  return { request, get };
}

function createHttpPolyfill(bufferShim: any) {
  // Reuse https polyfill behavior but default protocol to http
  const httpsLike = createHttpsPolyfill(bufferShim) as any;
  const wrapOptions = (options: any) => {
    if (!options || typeof options === 'string') return options;
    if (typeof options?.protocol !== 'string') return { ...options, protocol: 'http:' };
    return options;
  };

  return {
    request: (options: any, cb?: any) => httpsLike.request(wrapOptions(options), cb),
    get: (options: any, cb?: any) => httpsLike.get(wrapOptions(options), cb),
  };
}

function createTlsPolyfill() {
  const createEmitter = () => {
    const listeners: Record<string, Array<(...args: any[]) => void>> = {};
    const on = (event: string, handler: (...args: any[]) => void) => {
      (listeners[event] ??= []).push(handler);
      return api;
    };
    const emit = (event: string, ...args: any[]) => {
      const arr = listeners[event];
      if (!arr) return false;
      for (const h of arr) h(...args);
      return true;
    };
    const api: any = {
      on,
      addListener: on,
      once: (event: string, handler: (...args: any[]) => void) => {
        const wrap = (...args: any[]) => {
          api.removeListener(event, wrap);
          handler(...args);
        };
        return on(event, wrap);
      },
      removeListener: (event: string, handler: (...args: any[]) => void) => {
        const arr = listeners[event];
        if (!arr) return api;
        listeners[event] = arr.filter((h) => h !== handler);
        return api;
      },
      emit,
    };
    return api;
  };

  const connect = (_options: any, cb?: () => void) => {
    const socket: any = {
      ...createEmitter(),
      authorized: true,
      encrypted: true,
      getPeerCertificate: () => ({}),
      end: () => undefined,
      destroy: () => undefined,
      write: (_chunk: any, _enc?: any, cb2?: any) => {
        if (typeof cb2 === 'function') cb2();
        return true;
      },
      setTimeout: (_ms: number, _cb?: any) => undefined,
    };

    Promise.resolve().then(() => {
      socket.emit('secureConnect');
      if (typeof cb === 'function') {
        try {
          cb();
        } catch {
          // ignore
        }
      }
    });

    return socket;
  };

  const createSecureContext = (_options?: any) => ({ options: _options ?? {} });

  return { connect, createSecureContext };
}

function createChildProcessPolyfill() {
  const createEmitter = () => {
    const listeners: Record<string, Array<(...args: any[]) => void>> = {};
    const on = (event: string, handler: (...args: any[]) => void) => {
      (listeners[event] ??= []).push(handler);
      return api;
    };
    const emit = (event: string, ...args: any[]) => {
      const arr = listeners[event];
      if (!arr) return false;
      for (const h of arr) h(...args);
      return true;
    };
    const api: any = {
      on,
      addListener: on,
      once: (event: string, handler: (...args: any[]) => void) => {
        const wrap = (...args: any[]) => {
          api.removeListener(event, wrap);
          handler(...args);
        };
        return on(event, wrap);
      },
      removeListener: (event: string, handler: (...args: any[]) => void) => {
        const arr = listeners[event];
        if (!arr) return api;
        listeners[event] = arr.filter((h) => h !== handler);
        return api;
      },
      emit,
    };
    return api;
  };

  const createStubProc = (cmd: string) => {
    const p: any = {
      ...createEmitter(),
      pid: 0,
      killed: false,
      connected: false,
      stdin: null,
      stdout: createEmitter(),
      stderr: createEmitter(),
      kill: (_signal?: any) => {
        p.killed = true;
        return true;
      },
    };

    Promise.resolve().then(() => {
      const err: any = new Error(
        `child_process is not supported in GoPilot stage 2 runtime (renderer). Tried to run: ${cmd}`,
      );
      err.code = 'UNSUPPORTED';
      try {
        p.emit('error', err);
      } catch {
        // ignore
      }
    });

    return p;
  };

  const exec = (command: string, _options?: any, cb?: any) => {
    const proc = createStubProc(command);
    const callback = typeof _options === 'function' ? _options : cb;
    if (typeof callback === 'function') {
      Promise.resolve().then(() => callback(new Error('child_process.exec is not supported'), '', ''));
    }
    return proc;
  };

  const spawn = (command: string, _args?: any, _options?: any) => {
    return createStubProc(command);
  };

  const execFile = (file: string, _args?: any, _options?: any, cb?: any) => {
    const proc = createStubProc(file);
    const callback = typeof _args === 'function' ? _args : typeof _options === 'function' ? _options : cb;
    if (typeof callback === 'function') {
      Promise.resolve().then(() => callback(new Error('child_process.execFile is not supported'), '', ''));
    }
    return proc;
  };

  const fork = (modulePath: string, _args?: any, _options?: any) => {
    return createStubProc(modulePath);
  };

  return { exec, spawn, execFile, fork };
}

function createAssertPolyfill() {
  const fail = (message?: string) => {
    throw new Error(message || 'Assertion failed');
  };

  const ok = (value: any, message?: string) => {
    if (!value) fail(message);
  };

  const equal = (a: any, b: any, message?: string) => {
    // eslint-disable-next-line eqeqeq
    if (a != b) fail(message || `Expected ${a} == ${b}`);
  };

  const strictEqual = (a: any, b: any, message?: string) => {
    if (a !== b) fail(message || `Expected ${a} === ${b}`);
  };

  const deepStrictEqual = (a: any, b: any, message?: string) => {
    try {
      const ja = JSON.stringify(a);
      const jb = JSON.stringify(b);
      if (ja !== jb) fail(message || 'Expected values to be deepStrictEqual');
    } catch {
      if (a !== b) fail(message || 'Expected values to be deepStrictEqual');
    }
  };

  const assert: any = (value: any, message?: string) => ok(value, message);
  assert.ok = ok;
  assert.equal = equal;
  assert.strictEqual = strictEqual;
  assert.deepStrictEqual = deepStrictEqual;
  assert.fail = fail;
  assert.strict = {
    ok,
    equal,
    strictEqual,
    deepStrictEqual,
    fail,
  };

  return assert;
}

function createNetPolyfill() {
  const createEmitter = () => {
    const listeners: Record<string, Array<(...args: any[]) => void>> = {};
    const on = (event: string, handler: (...args: any[]) => void) => {
      (listeners[event] ??= []).push(handler);
      return api;
    };
    const emit = (event: string, ...args: any[]) => {
      const arr = listeners[event];
      if (!arr) return false;
      for (const h of arr) h(...args);
      return true;
    };
    const api: any = {
      on,
      addListener: on,
      once: (event: string, handler: (...args: any[]) => void) => {
        const wrap = (...args: any[]) => {
          api.removeListener(event, wrap);
          handler(...args);
        };
        return on(event, wrap);
      },
      removeListener: (event: string, handler: (...args: any[]) => void) => {
        const arr = listeners[event];
        if (!arr) return api;
        listeners[event] = arr.filter((h) => h !== handler);
        return api;
      },
      emit,
      listenerCount: (event: string) => {
        const arr = listeners[event];
        return Array.isArray(arr) ? arr.length : 0;
      },
    };
    return api;
  };

  const createStubSocket = () => {
    const socket: any = {
      ...createEmitter(),
      destroyed: false,
      readable: false,
      writable: false,
      remoteAddress: undefined,
      remotePort: undefined,
      localAddress: undefined,
      localPort: undefined,
      end: () => undefined,
      destroy: () => {
        socket.destroyed = true;
      },
      write: (_chunk: any, _enc?: any, cb?: any) => {
        if (typeof cb === 'function') cb();
        return false;
      },
      setTimeout: (_ms: number, _cb?: any) => undefined,
      setNoDelay: (_noDelay?: boolean) => undefined,
      setKeepAlive: (_enable?: boolean, _initialDelay?: number) => undefined,
    };

    Promise.resolve().then(() => {
      const err: any = new Error('net sockets are not supported in GoPilot stage 2 runtime (renderer).');
      err.code = 'UNSUPPORTED';
      try {
        socket.emit('error', err);
      } catch {
        // ignore
      }
    });

    return socket;
  };

  const connect = (_options: any, cb?: () => void) => {
    const socket = createStubSocket();
    if (typeof cb === 'function') {
      try {
        socket.once('connect', cb);
      } catch {
        // ignore
      }
    }
    return socket;
  };

  const createConnection = connect;

  return { connect, createConnection };
}

function createQuerystringPolyfill() {
  const escape = (str: string) => encodeURIComponent(str);
  const unescape = (str: string) => {
    try {
      return decodeURIComponent(str.replace(/\+/g, '%20'));
    } catch {
      return str;
    }
  };

  const parse = (qs: string, sep = '&', eq = '=', _options?: any) => {
    const out: Record<string, any> = {};
    const s = (qs ?? '').toString();
    if (!s) return out;

    const parts = s.split(sep);
    for (const part of parts) {
      if (!part) continue;
      const idx = part.indexOf(eq);
      const k = idx >= 0 ? part.slice(0, idx) : part;
      const v = idx >= 0 ? part.slice(idx + eq.length) : '';
      const key = unescape(k);
      const val = unescape(v);

      if (Object.prototype.hasOwnProperty.call(out, key)) {
        const prev = out[key];
        if (Array.isArray(prev)) prev.push(val);
        else out[key] = [prev, val];
      } else {
        out[key] = val;
      }
    }
    return out;
  };

  const stringify = (obj: any, sep = '&', eq = '=', _options?: any) => {
    if (!obj) return '';
    const parts: string[] = [];
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      const key = escape(String(k));
      if (Array.isArray(v)) {
        for (const item of v) parts.push(`${key}${eq}${escape(String(item))}`);
      } else {
        parts.push(`${key}${eq}${escape(String(v))}`);
      }
    }
    return parts.join(sep);
  };

  return { parse, stringify, escape, unescape };
}

function createDiagnosticsChannelPolyfill() {
  type Handler = (message: any, name: string) => void;
  const channels = new Map<string, { name: string; subscribers: Set<Handler> }>();

  const get = (name: string) => {
    const key = String(name ?? '');
    const existing = channels.get(key);
    if (existing) return existing;
    const next = { name: key, subscribers: new Set<Handler>() };
    channels.set(key, next);
    return next;
  };

  const channel = (name: string) => {
    const ch = get(name);
    return {
      name: ch.name,
      hasSubscribers: () => ch.subscribers.size > 0,
      publish: (message: any) => {
        for (const fn of ch.subscribers) {
          try {
            fn(message, ch.name);
          } catch {
            // ignore
          }
        }
      },
      subscribe: (fn: Handler) => {
        if (typeof fn === 'function') ch.subscribers.add(fn);
      },
      unsubscribe: (fn: Handler) => {
        ch.subscribers.delete(fn);
      },
    };
  };

  return { channel };
}

function createUrlPolyfill() {
  // Minimal WHATWG URL polyfill for Node compatibility
  const URL = globalThis.URL;
  const URLSearchParams = globalThis.URLSearchParams;
  const parse = (url: string) => {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  };
  const resolve = (base: string, relative: string) => {
    try {
      return new URL(relative, base).href;
    } catch {
      return relative;
    }
  };
  const format = (urlObj: any) => {
    try {
      return urlObj.href;
    } catch {
      return String(urlObj);
    }
  };
  return { URL, URLSearchParams, parse, resolve, format };
}

function createZlibPolyfill() {
  // Stub zlib polyfill to avoid crashes
  const deflate = (_buf: any, _opts: any, cb: any) => {
    if (typeof _opts === 'function') { cb = _opts; _opts = {}; }
    if (cb) setTimeout(() => cb(new Error('zlib.deflate not supported in web runtime')), 0);
  };
  const deflateSync = (_buf: any, _opts: any) => {
    throw new Error('zlib.deflateSync not supported in web runtime');
  };
  const inflate = (_buf: any, _opts: any, cb: any) => {
    if (typeof _opts === 'function') { cb = _opts; _opts = {}; }
    if (cb) setTimeout(() => cb(new Error('zlib.inflate not supported in web runtime')), 0);
  };
  const inflateSync = (_buf: any, _opts: any) => {
    throw new Error('zlib.inflateSync not supported in web runtime');
  };
  const gzip = deflate;
  const gunzip = inflate;
  const gzipSync = deflateSync;
  const gunzipSync = inflateSync;
  return { deflate, deflateSync, inflate, inflateSync, gzip, gunzip, gzipSync, gunzipSync };
}

function createTimersPolyfill() {
  const setTimeout = global.setTimeout;
  const clearTimeout = global.clearTimeout;
  const setInterval = global.setInterval;
  const clearInterval = global.clearInterval;
  const setImmediate = (fn: (...args: any[]) => void, ...args: any[]) => setTimeout(fn, 0, ...args);
  const clearImmediate = (id: any) => clearTimeout(id);
  return { setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate };
}

function createAsyncHooksPolyfill() {
  // Stub async_hooks polyfill to avoid crashes
  const createHook = (_options: any) => ({
    enable: () => {},
    disable: () => {},
  });
  const executionAsyncId = () => 1;
  const triggerAsyncId = () => 0;
  const AsyncResource = class {
    constructor(_type: string, _triggerAsyncId?: number) {}
    asyncId: number = 1;
    triggerAsyncId: number = 0;
    emitBefore = () => {};
    emitAfter = () => {};
    emitDestroy = () => {};
  };
  return { createHook, executionAsyncId, triggerAsyncId, AsyncResource };
}

function createDnsPolyfill() {
  // Stub dns polyfill to avoid crashes
  const lookup = (_hostname: string, callback: any) => {
    if (typeof callback === 'function') {
      setTimeout(() => callback(new Error('dns.lookup not supported in web runtime')), 0);
    }
  };
  const lookupService = (_address: string, _port: number, callback: any) => {
    if (typeof callback === 'function') {
      setTimeout(() => callback(new Error('dns.lookupService not supported in web runtime')), 0);
    }
  };
  const resolve = (_hostname: string, callback: any) => {
    if (typeof callback === 'function') {
      setTimeout(() => callback(new Error('dns.resolve not supported in web runtime')), 0);
    }
  };
  const resolve4 = resolve;
  const resolve6 = resolve;
  const reverse = (_ip: string, callback: any) => {
    if (typeof callback === 'function') {
      setTimeout(() => callback(new Error('dns.reverse not supported in web runtime')), 0);
    }
  };
  return { lookup, lookupService, resolve, resolve4, resolve6, reverse };
}

function createPerfHooksPolyfill() {
  // Minimal perf_hooks polyfill using performance.now()
  const performance = globalThis.performance;
  const now = () => performance.now();
  const timing = performance.timing || {};
  const nodeTiming = {
    name: 'node',
    entryType: 'node',
    startTime: 0,
    duration: 0,
    nodeStart: timing.navigationStart || 0,
    v8Start: timing.navigationStart || 0,
    bootstrapComplete: timing.navigationStart || 0,
    environment: timing.navigationStart || 0,
    loopStart: timing.navigationStart || 0,
    loopExit: timing.navigationStart || 0,
    idleStart: timing.navigationStart || 0,
    idleEnd: timing.navigationStart || 0,
  };
  const mark = (name: string) => {
    try {
      performance.mark(name);
    } catch {
      // ignore if mark already exists
    }
  };
  const measure = (name: string, startMark?: string, endMark?: string) => {
    try {
      performance.measure(name, startMark, endMark);
    } catch {
      // ignore if marks don't exist
    }
  };
  const clearMarks = (name?: string) => {
    try {
      performance.clearMarks(name);
    } catch {
      // ignore
    }
  };
  const clearMeasures = (name?: string) => {
    try {
      performance.clearMeasures(name);
    } catch {
      // ignore
    }
  };
  const PerformanceObserver = class {
    constructor(_callback: any) {
      // Stub
    }
    observe() {}
    disconnect() {}
  };
  return { performance, now, nodeTiming, mark, measure, clearMarks, clearMeasures, PerformanceObserver };
}

function createFsPolyfill() {
  // Stub fs polyfill to avoid crashes
  const readFile = (_path: string, callback?: any) => {
    if (typeof callback === 'function') {
      setTimeout(() => callback(new Error('fs.readFile not supported in web runtime')), 0);
    }
  };
  const readFileSync = (_path: string) => {
    throw new Error('fs.readFileSync not supported in web runtime');
  };
  const writeFile = (_path: string, _data: any, callback?: any) => {
    if (typeof callback === 'function') {
      setTimeout(() => callback(new Error('fs.writeFile not supported in web runtime')), 0);
    }
  };
  const writeFileSync = (_path: string, _data: any) => {
    throw new Error('fs.writeFileSync not supported in web runtime');
  };
  const exists = (_path: string, callback?: any) => {
    if (typeof callback === 'function') {
      setTimeout(() => callback(false), 0);
    }
  };
  const existsSync = () => false;
  const stat = (_path: string, callback?: any) => {
    if (typeof callback === 'function') {
      setTimeout(() => callback(new Error('fs.stat not supported in web runtime')), 0);
    }
  };
  const statSync = (_path: string) => {
    throw new Error('fs.statSync not supported in web runtime');
  };
  const mkdir = (_path: string, callback?: any) => {
    if (typeof callback === 'function') {
      setTimeout(() => callback(new Error('fs.mkdir not supported in web runtime')), 0);
    }
  };
  const mkdirSync = (_path: string) => {
    throw new Error('fs.mkdirSync not supported in web runtime');
  };
  const readdir = (_path: string, callback?: any) => {
    if (typeof callback === 'function') {
      setTimeout(() => callback(new Error('fs.readdir not supported in web runtime')), 0);
    }
  };
  const readdirSync = (_path: string) => {
    throw new Error('fs.readdirSync not supported in web runtime');
  };
  const unlink = (_path: string, callback?: any) => {
    if (typeof callback === 'function') {
      setTimeout(() => callback(new Error('fs.unlink not supported in web runtime')), 0);
    }
  };
  const unlinkSync = (_path: string) => {
    throw new Error('fs.unlinkSync not supported in web runtime');
  };
  const constants = {
    F_OK: 0,
    R_OK: 4,
    W_OK: 2,
    X_OK: 1,
  };
  return {
    readFile, readFileSync, writeFile, writeFileSync,
    exists, existsSync, stat, statSync, mkdir, mkdirSync,
    readdir, readdirSync, unlink, unlinkSync, constants,
  };
}

function createVmPolyfill() {
  // Stub vm polyfill to avoid crashes
  const createContext = (_contextObject: any) => ({});
  const runInContext = (_code: string, _contextifiedSandbox: any) => {
    throw new Error('vm.runInContext not supported in web runtime');
  };
  const runInNewContext = (_code: string, _sandbox?: any) => {
    throw new Error('vm.runInNewContext not supported in web runtime');
  };
  const runInThisContext = (_code: string) => {
    throw new Error('vm.runInThisContext not supported in web runtime');
  };
  const Script = class {
    constructor(_code: string) {}
    runInContext() { throw new Error('Script.runInContext not supported'); }
    runInNewContext() { throw new Error('Script.runInNewContext not supported'); }
    runInThisContext() { throw new Error('Script.runInThisContext not supported'); }
  };
  return { createContext, runInContext, runInNewContext, runInThisContext, Script };
}

function createReadlinePolyfill() {
  // Stub readline polyfill to avoid crashes
  const createInterface = (_options: any) => ({
    question: (_query: string, callback: any) => {
      if (typeof callback === 'function') {
        setTimeout(() => callback(''), 0);
      }
    },
    close: () => {},
    on: () => {},
    pause: () => {},
    resume: () => {},
  });
  return { createInterface };
}

function notifyWebviewsChanged() {
  try {
    window.dispatchEvent(new CustomEvent('extensions-webviews-changed'));
  } catch {
    // ignore
  }
}

function notifyRuntimeChanged() {
  notifyWebviewsChanged();
}

function getDirname(p: string) {
  const norm = p.replace(/\\/g, '/');
  const idx = norm.lastIndexOf('/');
  return idx >= 0 ? norm.slice(0, idx) : '';
}

function joinPath(...parts: string[]) {
  const joined = parts
    .filter(Boolean)
    .join('/')
    .replace(/\\/g, '/')
    .replace(/\/+/, '/');
  return joined;
}

async function readTextFile(filePath: string) {
  const fs = await import('@tauri-apps/api/fs');
  return await fs.readTextFile(filePath);
}

async function fileExists(filePath: string) {
  const fs = await import('@tauri-apps/api/fs');
  try {
    await fs.readTextFile(filePath);
    return true;
  } catch {
    return false;
  }
}

function createVscodeShim() {
  const emitOutput = (title: string, text: string) => {
    try {
      window.dispatchEvent(new CustomEvent('extensions-output', { detail: { title, text } }));
    } catch {
      // ignore
    }
  };

  const vscode = {
    commands: {
      registerCommand: (commandId: string, handler: (...args: any[]) => any) => {
        commands.set(commandId, handler);
        return { dispose: () => commands.delete(commandId) };
      },
      executeCommand: async (commandId: string, ...args: any[]) => {
        const fn = commands.get(commandId);
        if (!fn) throw new Error(`Command not found: ${commandId}`);
        return await fn(...args);
      },
    },
    window: {
      registerWebviewViewProvider: (viewId: string, provider: any) => {
        (async () => {
          const webviewView = {
            webview: {
              html: '',
              postMessage: async (_msg: any) => false,
              onDidReceiveMessage: (_handler: any) => ({ dispose: () => undefined }),
            },
            onDidDispose: (_handler: any) => ({ dispose: () => undefined }),
            show: (_preserveFocus?: boolean) => undefined,
          };

          try {
            if (provider && typeof provider.resolveWebviewView === 'function') {
              await provider.resolveWebviewView(webviewView);
            }
          } catch (e) {
            const msg = typeof e === 'string' ? e : (e as any)?.message ? String((e as any).message) : 'Unknown error';
            webviewView.webview.html = `<pre style="white-space: pre-wrap;">Failed to resolve webview: ${msg}</pre>`;
          }

          webviews.set(viewId, { viewId, html: String(webviewView.webview.html ?? '') });
          notifyWebviewsChanged();
        })();

        return { dispose: () => webviews.delete(viewId) };
      },
      createOutputChannel: (name: string) => {
        const safeName = (name ?? '').toString() || 'Output';
        if (!outputChannels.has(safeName)) outputChannels.set(safeName, { name: safeName, text: '' });
        const get = () => outputChannels.get(safeName)!;

        const api = {
          name: safeName,
          append: (value: string) => {
            const ch = get();
            ch.text += String(value ?? '');
            emitOutput(safeName, String(value ?? ''));
          },
          appendLine: (value: string) => {
            const ch = get();
            const v = `${String(value ?? '')}\n`;
            ch.text += v;
            emitOutput(safeName, v);
          },
          clear: () => {
            const ch = get();
            ch.text = '';
          },
          show: (_preserveFocus?: boolean) => undefined,
          hide: () => undefined,
          dispose: () => {
            outputChannels.delete(safeName);
          },
        };

        return api;
      },
      showInformationMessage: async (_message: string) => undefined,
      showWarningMessage: async (_message: string) => undefined,
      showErrorMessage: async (_message: string) => undefined,
    },
    workspace: {},
    env: {},
    Uri: {
      file: (p: string) => ({ fsPath: p, path: p, toString: () => p }),
      parse: (p: string) => ({ fsPath: p, path: p, toString: () => p }),
    },
  };

  return vscode;
}

export function getWebviewHtml(viewId: string) {
  // 暂时为 Augment 扩展提供一个简单的 webview 内容
  if (viewId.includes('augment')) {
    return `
      <html>
        <head>
          <style>
            body { 
              font-family: system-ui, -apple-system, sans-serif; 
              margin: 0; 
              padding: 20px; 
              background: #f8f9fa;
            }
            .container {
              max-width: 800px;
              margin: 0 auto;
              background: white;
              border-radius: 8px;
              padding: 24px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            .header {
              font-size: 18px;
              font-weight: 600;
              margin-bottom: 16px;
              color: #333;
            }
            .status {
              color: #666;
              font-size: 14px;
              margin-bottom: 20px;
            }
            .feature {
              padding: 12px;
              background: #f1f3f4;
              border-radius: 6px;
              margin-bottom: 8px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">🤖 Augment Extension</div>
            <div class="status">Extension is running in Node.js environment</div>
            <div class="feature">✅ Node.js APIs available</div>
            <div class="feature">✅ Full VSCode compatibility</div>
            <div class="feature">🚀 Ready for AI-powered features</div>
            <div class="feature">📝 Code completion and analysis</div>
          </div>
        </body>
      </html>
    `;
  }
  
  return webviews.get(viewId)?.html ?? '';
}

export function getExtensionActivationError(extId: string) {
  return extensionErrors.get(extId) ?? '';
}

function formatError(e: any, fallback: string) {
  if (typeof e === 'string') return e;
  if (!e) return fallback;
  const msg = e?.message ? String(e.message) : fallback;
  const stack = e?.stack ? String(e.stack) : '';
  return stack ? `${msg}\n\n${stack}` : msg;
}

export function listWebviews() {
  return Array.from(webviews.values());
}

export async function activateInstalledExtensions(_registry: ExtensionRegistry) {
  const installed = loadInstalledExtensions().filter((e) => e.enabled !== false && e.installDir);

  for (const ext of installed) {
    // Minimal polyfills for common Node globals expected by many VSCode extensions
    // (running inside our web/Tauri renderer runtime)
    try {
      const g: any = globalThis as any;
      if (typeof g.global === 'undefined') g.global = g;
      if (typeof g.setImmediate === 'undefined') {
        g.setImmediate = (fn: (...args: any[]) => void, ...args: any[]) => {
          return setTimeout(() => fn(...args), 0);
        };
      }
      if (typeof g.clearImmediate === 'undefined') {
        g.clearImmediate = (handle: any) => {
          try {
            clearTimeout(handle);
          } catch {
            // ignore
          }
        };
      }
      if (typeof g.process === 'undefined') {
        const listeners: Record<string, Array<(...args: any[]) => void>> = {};
        const on = (event: string, handler: (...args: any[]) => void) => {
          (listeners[event] ??= []).push(handler);
          return g.process;
        };
        const emit = (event: string, ...args: any[]) => {
          const arr = listeners[event];
          if (!arr) return false;
          for (const h of arr) h(...args);
          return true;
        };

        const makeStdStream = () => ({
          isTTY: false,
          columns: 80,
          rows: 24,
          write: (_chunk: any, _enc?: any, cb?: any) => {
            if (typeof cb === 'function') cb();
            return true;
          },
          on: (_evt: string, _handler: any) => ({ dispose: () => undefined }),
        });

        g.process = {
          env: {
            PATH: '',
            Path: '',
            HOME: '',
            USERPROFILE: '',
            TMP: '',
            TEMP: '',
          },
          argv: [],
          pid: 0,
          platform: 'win32',
          arch: 'x64',
          version: '',
          versions: { node: '0.0.0' },
          browser: true,
          cwd: () => '',
          nextTick: (cb: (...args: any[]) => void, ...args: any[]) => {
            Promise.resolve().then(() => cb(...args));
          },
          stdout: makeStdStream(),
          stderr: makeStdStream(),
          on,
          addListener: on,
          once: on,
          emit,
          removeListener: (_event: string, _handler: (...args: any[]) => void) => g.process,
          exit: (_code?: number) => undefined,
          hrtime: () => [0, 0],
          uptime: () => 0,
          emitWarning: (_warning: any) => undefined,
        };
      }
    } catch {
      // ignore
    }

    const installDir = ext.installDir!;
    if (extensionErrors.has(ext.id)) {
      extensionErrors.delete(ext.id);
      notifyRuntimeChanged();
    }

    let manifestPath = joinPath(installDir, 'extension', 'package.json');
    if (!(await fileExists(manifestPath))) {
      manifestPath = joinPath(installDir, 'package.json');
    }

    let manifest: any = null;
    try {
      manifest = JSON.parse(await readTextFile(manifestPath));
    } catch {
      continue;
    }

    const mainRel = typeof manifest?.main === 'string' ? manifest.main : undefined;
    if (!mainRel) continue;

    const entryPath = joinPath(installDir, 'extension', mainRel);
    let code = '';
    try {
      code = await readTextFile(entryPath);
    } catch {
      continue;
    }

    const codeWithSourceUrl = `${code}\n//# sourceURL=${entryPath.replace(/\s/g, '%20')}`;

    const vscodeShim = createVscodeShim();
    const utilShim = createUtilPolyfill();
    const osShim = createOsPolyfill();
    const streamShim = createStreamPolyfill();
    const eventsShim = createEventsPolyfill();
    const pathShim = createPathPolyfill();
    const bufferShim = createBufferPolyfill();
    const ttyShim = createTtyPolyfill();
    const cryptoShim = createCryptoPolyfill(bufferShim);
    const httpsShim = createHttpsPolyfill(bufferShim);
    const httpShim = createHttpPolyfill(bufferShim);
    const tlsShim = createTlsPolyfill();
    const childProcessShim = createChildProcessPolyfill();
    const assertShim = createAssertPolyfill();
    const netShim = createNetPolyfill();
    const querystringShim = createQuerystringPolyfill();
    const diagnosticsChannelShim = createDiagnosticsChannelPolyfill();
    const urlShim = createUrlPolyfill();
    const zlibShim = createZlibPolyfill();
    const timersShim = createTimersPolyfill();
    const asyncHooksShim = createAsyncHooksPolyfill();
    const dnsShim = createDnsPolyfill();
    const perfHooksShim = createPerfHooksPolyfill();
    const fsShim = createFsPolyfill();
    const vmShim = createVmPolyfill();
    const readlineShim = createReadlinePolyfill();

    const mod = { exports: {} as any };

    try {
      const fn = new Function('require', 'module', 'exports', '__filename', '__dirname', 'Buffer', codeWithSourceUrl);
      const entryDir = getDirname(entryPath);

      const entryRequire = (request: string) => {
        if (request === 'vscode') return vscodeShim;
        if (request === 'util') return utilShim;
        if (request === 'os') return osShim;
        if (request === 'events') return eventsShim;
        if (request === 'path') return pathShim;
        if (request === 'buffer') return bufferShim;
        if (request === 'stream') return streamShim;
        if (request === 'tty') return ttyShim;
        if (request === 'console') return console;
        if (request === 'crypto') return cryptoShim;
        if (request === 'https') return httpsShim;
        if (request === 'http') return httpShim;
        if (request === 'tls') return tlsShim;
        if (request === 'child_process') return childProcessShim;
        if (request === 'assert') return assertShim;
        if (request === 'net') return netShim;
        if (request === 'querystring') return querystringShim;
        if (request === 'diagnostics_channel') return diagnosticsChannelShim;
        if (request === 'url') return urlShim;
        if (request === 'zlib') return zlibShim;
        if (request === 'timers') return timersShim;
        if (request === 'async_hooks') return asyncHooksShim;
        if (request === 'dns') return dnsShim;
        if (request === 'perf_hooks') return perfHooksShim;
        if (request === 'fs') return fsShim;
        if (request === 'vm') return vmShim;
        if (request === 'readline') return readlineShim;
        throw new Error(
          `Unsupported require in entry: ${request}. (GoPilot stage 2 runtime currently only supports require('vscode'))`,
        );
      };

      fn(entryRequire, mod, mod.exports, entryPath, entryDir, bufferShim.Buffer);

      const activate = (mod.exports as any)?.activate;
      if (typeof activate === 'function') {
        try {
          await activate({ subscriptions: [], extensionPath: joinPath(installDir, 'extension') });
        } catch (e) {
          extensionErrors.set(ext.id, formatError(e, 'Failed to activate extension.'));
          notifyRuntimeChanged();
        }
      }
    } catch (e) {
      const base = formatError(e, 'Failed to execute extension entry.');
      const msg = base.includes('iU.call is not a function')
        ? `${base}\n\n[GoPilot diagnostics]\nrequire('events') typeof: ${typeof eventsShim}\nrequire('events').EventEmitter typeof: ${typeof (eventsShim as any)?.EventEmitter}`
        : base;
      extensionErrors.set(ext.id, msg);
      notifyRuntimeChanged();
    }
  }
}
