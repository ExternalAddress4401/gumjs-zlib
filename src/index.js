import { Buffer, kMaxLength } from "buffer";
import { Transform } from "stream";
import {
  Z_NO_FLUSH,
  Z_PARTIAL_FLUSH,
  Z_SYNC_FLUSH,
  Z_FULL_FLUSH,
  Z_FINISH,
  Z_BLOCK,
  Z_TREES,
  Z_OK,
  Z_STREAM_END,
  Z_NEED_DICT,
  Z_ERRNO,
  Z_STREAM_ERROR,
  Z_DATA_ERROR,
  Z_MEM_ERROR,
  Z_BUF_ERROR,
  Z_NO_COMPRESSION,
  Z_BEST_SPEED,
  Z_BEST_COMPRESSION,
  Z_DEFAULT_COMPRESSION,
  Z_FILTERED,
  Z_HUFFMAN_ONLY,
  Z_RLE,
  Z_FIXED,
  Z_DEFAULT_STRATEGY,
  Z_BINARY,
  Z_TEXT,
  Z_UNKNOWN,
  Z_DEFLATED,
} from "./binding.js";
import util from "util";
import assert from "assert";

const kRangeErrorMessage =
  "Cannot create final Buffer. It would be larger " +
  "than 0x" +
  kMaxLength.toString(16) +
  " bytes";

// zlib doesn't provide these, so kludge them in following the same
// const naming scheme zlib uses.
const Z_MIN_WINDOWBITS = 8;
const Z_MAX_WINDOWBITS = 15;
const Z_DEFAULT_WINDOWBITS = 15;

// fewer than 64 bytes per chunk is stupid.
// technically it could work with as few as 8, but even 64 bytes
// is absurdly low.  Usually a MB or more is best.
const Z_MIN_CHUNK = 64;
const Z_MAX_CHUNK = Infinity;
const Z_DEFAULT_CHUNK = 16 * 1024;

const Z_MIN_MEMLEVEL = 1;
const Z_MAX_MEMLEVEL = 9;
const Z_DEFAULT_MEMLEVEL = 8;

const Z_MIN_LEVEL = -1;
const Z_MAX_LEVEL = 9;
const Z_DEFAULT_LEVEL = Z_DEFAULT_COMPRESSION;

// translation table for return codes.
const codes = {
  Z_OK: Z_OK,
  Z_STREAM_END: Z_STREAM_END,
  Z_NEED_DICT: Z_NEED_DICT,
  Z_ERRNO: Z_ERRNO,
  Z_STREAM_ERROR: Z_STREAM_ERROR,
  Z_DATA_ERROR: Z_DATA_ERROR,
  Z_MEM_ERROR: Z_MEM_ERROR,
  Z_BUF_ERROR: Z_BUF_ERROR,
  Z_VERSION_ERROR: undefined,
};

const ckeys = Object.keys(codes);
for (var ck = 0; ck < ckeys.length; ck++) {
  var ckey = ckeys[ck];
  codes[codes[ckey]] = ckey;
}

const createDeflate = function (o) {
  return new Deflate(o);
};

const createInflate = function (o) {
  return new Inflate(o);
};

const createDeflateRaw = function (o) {
  return new DeflateRaw(o);
};

const createInflateRaw = function (o) {
  return new InflateRaw(o);
};

const createGzip = function (o) {
  return new Gzip(o);
};

const createGunzip = function (o) {
  return new Gunzip(o);
};

const createUnzip = function (o) {
  return new Unzip(o);
};

// Convenience methods.
// compress/decompress a string or buffer in one step.
const deflate = function (buffer, opts, callback) {
  if (typeof opts === "function") {
    callback = opts;
    opts = {};
  }
  return zlibBuffer(new Deflate(opts), buffer, callback);
};

const deflateSync = function (buffer, opts) {
  return zlibBufferSync(new Deflate(opts), buffer);
};

const gzip = function (buffer, opts, callback) {
  if (typeof opts === "function") {
    callback = opts;
    opts = {};
  }
  return zlibBuffer(new Gzip(opts), buffer, callback);
};

const gzipSync = function (buffer, opts) {
  return zlibBufferSync(new Gzip(opts), buffer);
};

const deflateRaw = function (buffer, opts, callback) {
  if (typeof opts === "function") {
    callback = opts;
    opts = {};
  }
  return zlibBuffer(new DeflateRaw(opts), buffer, callback);
};

const deflateRawSync = function (buffer, opts) {
  return zlibBufferSync(new DeflateRaw(opts), buffer);
};

const unzip = function (buffer, opts, callback) {
  if (typeof opts === "function") {
    callback = opts;
    opts = {};
  }
  return zlibBuffer(new Unzip(opts), buffer, callback);
};

const unzipSync = function (buffer, opts) {
  return zlibBufferSync(new Unzip(opts), buffer);
};

const inflate = function (buffer, opts, callback) {
  if (typeof opts === "function") {
    callback = opts;
    opts = {};
  }
  return zlibBuffer(new Inflate(opts), buffer, callback);
};

const inflateSync = function (buffer, opts) {
  return zlibBufferSync(new Inflate(opts), buffer);
};

const gunzip = function (buffer, opts, callback) {
  if (typeof opts === "function") {
    callback = opts;
    opts = {};
  }
  return zlibBuffer(new Gunzip(opts), buffer, callback);
};

const gunzipSync = function (buffer, opts) {
  return zlibBufferSync(new Gunzip(opts), buffer);
};

const inflateRaw = function (buffer, opts, callback) {
  if (typeof opts === "function") {
    callback = opts;
    opts = {};
  }
  return zlibBuffer(new InflateRaw(opts), buffer, callback);
};

const inflateRawSync = function (buffer, opts) {
  return zlibBufferSync(new InflateRaw(opts), buffer);
};

function zlibBuffer(engine, buffer, callback) {
  var buffers = [];
  var nread = 0;

  engine.on("error", onError);
  engine.on("end", onEnd);

  engine.end(buffer);
  flow();

  function flow() {
    var chunk;
    while (null !== (chunk = engine.read())) {
      buffers.push(chunk);
      nread += chunk.length;
    }
    engine.once("readable", flow);
  }

  function onError(err) {
    engine.removeListener("end", onEnd);
    engine.removeListener("readable", flow);
    callback(err);
  }

  function onEnd() {
    var buf;
    var err = null;

    if (nread >= kMaxLength) {
      err = new RangeError(kRangeErrorMessage);
    } else {
      buf = Buffer.concat(buffers, nread);
    }

    buffers = [];
    engine.close();
    callback(err, buf);
  }
}

function zlibBufferSync(engine, buffer) {
  if (typeof buffer === "string") buffer = Buffer.from(buffer);

  if (!Buffer.isBuffer(buffer)) throw new TypeError("Not a string or buffer");

  var flushFlag = engine._finishFlushFlag;

  return engine._processChunk(buffer, flushFlag);
}

// generic zlib
// minimal 2-byte header
function Deflate(opts) {
  if (!(this instanceof Deflate)) return new Deflate(opts);
  Zlib.call(this, opts, DEFLATE);
}

function Inflate(opts) {
  if (!(this instanceof Inflate)) return new Inflate(opts);
  Zlib.call(this, opts, INFLATE);
}

// gzip - bigger header, same deflate compression
function Gzip(opts) {
  if (!(this instanceof Gzip)) return new Gzip(opts);
  Zlib.call(this, opts, GZIP);
}

function Gunzip(opts) {
  if (!(this instanceof Gunzip)) return new Gunzip(opts);
  Zlib.call(this, opts, GUNZIP);
}

// raw - no header
function DeflateRaw(opts) {
  if (!(this instanceof DeflateRaw)) return new DeflateRaw(opts);
  Zlib.call(this, opts, DEFLATERAW);
}

function InflateRaw(opts) {
  if (!(this instanceof InflateRaw)) return new InflateRaw(opts);
  Zlib.call(this, opts, INFLATERAW);
}

// auto-detect header.
function Unzip(opts) {
  if (!(this instanceof Unzip)) return new Unzip(opts);
  Zlib.call(this, opts, UNZIP);
}

function isValidFlushFlag(flag) {
  return (
    flag === Z_NO_FLUSH ||
    flag === Z_PARTIAL_FLUSH ||
    flag === Z_SYNC_FLUSH ||
    flag === Z_FULL_FLUSH ||
    flag === Z_FINISH ||
    flag === Z_BLOCK
  );
}

// the Zlib class they all inherit from
// This thing manages the queue of requests, and returns
// true or false if there is anything in the queue when
// you call the .write() method.

function Zlib(opts, mode) {
  this._opts = opts = opts || {};
  this._chunkSize = opts.chunkSize || Z_DEFAULT_CHUNK;

  Transform.call(this, opts);

  if (opts.flush && !isValidFlushFlag(opts.flush)) {
    throw new Error("Invalid flush flag: " + opts.flush);
  }
  if (opts.finishFlush && !isValidFlushFlag(opts.finishFlush)) {
    throw new Error("Invalid flush flag: " + opts.finishFlush);
  }

  this._flushFlag = opts.flush || Z_NO_FLUSH;
  this._finishFlushFlag =
    typeof opts.finishFlush !== "undefined" ? opts.finishFlush : Z_FINISH;

  if (opts.chunkSize) {
    if (opts.chunkSize < Z_MIN_CHUNK || opts.chunkSize > Z_MAX_CHUNK) {
      throw new Error("Invalid chunk size: " + opts.chunkSize);
    }
  }

  if (opts.windowBits) {
    if (
      opts.windowBits < Z_MIN_WINDOWBITS ||
      opts.windowBits > Z_MAX_WINDOWBITS
    ) {
      throw new Error("Invalid windowBits: " + opts.windowBits);
    }
  }

  if (opts.level) {
    if (opts.level < Z_MIN_LEVEL || opts.level > Z_MAX_LEVEL) {
      throw new Error("Invalid compression level: " + opts.level);
    }
  }

  if (opts.memLevel) {
    if (opts.memLevel < Z_MIN_MEMLEVEL || opts.memLevel > Z_MAX_MEMLEVEL) {
      throw new Error("Invalid memLevel: " + opts.memLevel);
    }
  }

  if (opts.strategy) {
    if (
      opts.strategy != Z_FILTERED &&
      opts.strategy != Z_HUFFMAN_ONLY &&
      opts.strategy != Z_RLE &&
      opts.strategy != Z_FIXED &&
      opts.strategy != Z_DEFAULT_STRATEGY
    ) {
      throw new Error("Invalid strategy: " + opts.strategy);
    }
  }

  if (opts.dictionary) {
    if (!Buffer.isBuffer(opts.dictionary)) {
      throw new Error("Invalid dictionary: it should be a Buffer instance");
    }
  }

  this._handle = new Zlib(mode);

  var self = this;
  this._hadError = false;
  this._handle.onerror = function (message, errno) {
    // there is no way to cleanly recover.
    // continuing only obscures problems.
    _close(self);
    self._hadError = true;

    var error = new Error(message);
    error.errno = errno;
    error.code = codes[errno];
    self.emit("error", error);
  };

  var level = Z_DEFAULT_COMPRESSION;
  if (typeof opts.level === "number") level = opts.level;

  var strategy = Z_DEFAULT_STRATEGY;
  if (typeof opts.strategy === "number") strategy = opts.strategy;

  this._handle.init(
    opts.windowBits || Z_DEFAULT_WINDOWBITS,
    level,
    opts.memLevel || Z_DEFAULT_MEMLEVEL,
    strategy,
    opts.dictionary
  );

  this._buffer = Buffer.allocUnsafe(this._chunkSize);
  this._offset = 0;
  this._level = level;
  this._strategy = strategy;

  this.once("end", this.close);

  Object.defineProperty(this, "_closed", {
    get: () => {
      return !this._handle;
    },
    configurable: true,
    enumerable: true,
  });
}

util.inherits(Zlib, Transform);

Zlib.prototype.params = function (level, strategy, callback) {
  if (level < Z_MIN_LEVEL || level > Z_MAX_LEVEL) {
    throw new RangeError("Invalid compression level: " + level);
  }
  if (
    strategy != Z_FILTERED &&
    strategy != Z_HUFFMAN_ONLY &&
    strategy != Z_RLE &&
    strategy != Z_FIXED &&
    strategy != Z_DEFAULT_STRATEGY
  ) {
    throw new TypeError("Invalid strategy: " + strategy);
  }

  if (this._level !== level || this._strategy !== strategy) {
    var self = this;
    this.flush(Z_SYNC_FLUSH, function () {
      assert(self._handle, "zlib binding closed");
      self._handle.params(level, strategy);
      if (!self._hadError) {
        self._level = level;
        self._strategy = strategy;
        if (callback) callback();
      }
    });
  } else {
    process.nextTick(callback);
  }
};

Zlib.prototype.reset = function () {
  assert(this._handle, "zlib binding closed");
  return this._handle.reset();
};

// This is the _flush function called by the transform class,
// internally, when the last chunk has been written.
Zlib.prototype._flush = function (callback) {
  this._transform(Buffer.alloc(0), "", callback);
};

Zlib.prototype.flush = function (kind, callback) {
  var ws = this._writableState;

  if (typeof kind === "function" || (kind === undefined && !callback)) {
    callback = kind;
    kind = Z_FULL_FLUSH;
  }

  if (ws.ended) {
    if (callback) process.nextTick(callback);
  } else if (ws.ending) {
    if (callback) this.once("end", callback);
  } else if (ws.needDrain) {
    if (callback) {
      this.once("drain", () => this.flush(kind, callback));
    }
  } else {
    this._flushFlag = kind;
    this.write(Buffer.alloc(0), "", callback);
  }
};

Zlib.prototype.close = function (callback) {
  _close(this, callback);
  process.nextTick(emitCloseNT, this);
};

function _close(engine, callback) {
  if (callback) process.nextTick(callback);

  // Caller may invoke .close after a zlib error (which will null _handle).
  if (!engine._handle) return;

  engine._handle.close();
  engine._handle = null;
}

function emitCloseNT(self) {
  self.emit("close");
}

Zlib.prototype._transform = function (chunk, encoding, cb) {
  var flushFlag;
  var ws = this._writableState;
  var ending = ws.ending || ws.ended;
  var last = ending && (!chunk || ws.length === chunk.length);

  if (chunk !== null && !Buffer.isBuffer(chunk))
    return cb(new Error("invalid input"));

  if (!this._handle) return cb(new Error("zlib binding closed"));

  // If it's the last chunk, or a final flush, we use the Z_FINISH flush flag
  // (or whatever flag was provided using opts.finishFlush).
  // If it's explicitly flushing at some other time, then we use
  // Z_FULL_FLUSH. Otherwise, use Z_NO_FLUSH for maximum compression
  // goodness.
  if (last) flushFlag = this._finishFlushFlag;
  else {
    flushFlag = this._flushFlag;
    // once we've flushed the last of the queue, stop flushing and
    // go back to the normal behavior.
    if (chunk.length >= ws.length) {
      this._flushFlag = this._opts.flush || Z_NO_FLUSH;
    }
  }

  this._processChunk(chunk, flushFlag, cb);
};

Zlib.prototype._processChunk = function (chunk, flushFlag, cb) {
  var availInBefore = chunk && chunk.length;
  var availOutBefore = this._chunkSize - this._offset;
  var inOff = 0;

  var self = this;

  var async = typeof cb === "function";

  if (!async) {
    var buffers = [];
    var nread = 0;

    var error;
    this.on("error", function (er) {
      error = er;
    });

    assert(this._handle, "zlib binding closed");
    do {
      var res = this._handle.writeSync(
        flushFlag,
        chunk, // in
        inOff, // in_off
        availInBefore, // in_len
        this._buffer, // out
        this._offset, //out_off
        availOutBefore
      ); // out_len
    } while (!this._hadError && callback(res[0], res[1]));

    if (this._hadError) {
      throw error;
    }

    if (nread >= kMaxLength) {
      _close(this);
      throw new RangeError(kRangeErrorMessage);
    }

    var buf = Buffer.concat(buffers, nread);
    _close(this);

    return buf;
  }

  assert(this._handle, "zlib binding closed");
  var req = this._handle.write(
    flushFlag,
    chunk, // in
    inOff, // in_off
    availInBefore, // in_len
    this._buffer, // out
    this._offset, //out_off
    availOutBefore
  ); // out_len

  req.buffer = chunk;
  req.callback = callback;

  function callback(availInAfter, availOutAfter) {
    // When the callback is used in an async write, the callback's
    // context is the `req` object that was created. The req object
    // is === this._handle, and that's why it's important to null
    // out the values after they are done being used. `this._handle`
    // can stay in memory longer than the callback and buffer are needed.
    if (this) {
      this.buffer = null;
      this.callback = null;
    }

    if (self._hadError) return;

    var have = availOutBefore - availOutAfter;
    assert(have >= 0, "have should not go down");

    if (have > 0) {
      var out = self._buffer.slice(self._offset, self._offset + have);
      self._offset += have;
      // serve some output to the consumer.
      if (async) {
        self.push(out);
      } else {
        buffers.push(out);
        nread += out.length;
      }
    }

    // exhausted the output buffer, or used all the input create a new one.
    if (availOutAfter === 0 || self._offset >= self._chunkSize) {
      availOutBefore = self._chunkSize;
      self._offset = 0;
      self._buffer = Buffer.allocUnsafe(self._chunkSize);
    }

    if (availOutAfter === 0) {
      // Not actually done.  Need to reprocess.
      // Also, update the availInBefore to the availInAfter value,
      // so that if we have to hit it a third (fourth, etc.) time,
      // it'll have the correct byte counts.
      inOff += availInBefore - availInAfter;
      availInBefore = availInAfter;

      if (!async) return true;

      var newReq = self._handle.write(
        flushFlag,
        chunk,
        inOff,
        availInBefore,
        self._buffer,
        self._offset,
        self._chunkSize
      );
      newReq.callback = callback; // this same function
      newReq.buffer = chunk;
      return;
    }

    if (!async) return false;

    // finished with the chunk.
    cb();
  }
};

util.inherits(Deflate, Zlib);
util.inherits(Inflate, Zlib);
util.inherits(Gzip, Zlib);
util.inherits(Gunzip, Zlib);
util.inherits(DeflateRaw, Zlib);
util.inherits(InflateRaw, Zlib);
util.inherits(Unzip, Zlib);

export default {
  Deflate,
  Inflate,
  Gzip,
  Gunzip,
  DeflateRaw,
  InflateRaw,
  Unzip,
  codes,
  Z_NO_FLUSH,
  Z_PARTIAL_FLUSH,
  Z_SYNC_FLUSH,
  Z_FULL_FLUSH,
  Z_FINISH,
  Z_BLOCK,
  Z_TREES,
  Z_OK,
  Z_STREAM_END,
  Z_NEED_DICT,
  Z_ERRNO,
  Z_STREAM_ERROR,
  Z_DATA_ERROR,
  Z_MEM_ERROR,
  Z_BUF_ERROR,
  Z_NO_COMPRESSION,
  Z_BEST_SPEED,
  Z_BEST_COMPRESSION,
  Z_DEFAULT_COMPRESSION,
  Z_FILTERED,
  Z_HUFFMAN_ONLY,
  Z_RLE,
  Z_FIXED,
  Z_DEFAULT_STRATEGY,
  Z_BINARY,
  Z_TEXT,
  Z_UNKNOWN,
  Z_DEFLATED,
  Z_MIN_WINDOWBITS,
  Z_MAX_WINDOWBITS,
  Z_DEFAULT_WINDOWBITS,
  Z_MIN_CHUNK,
  Z_MAX_CHUNK,
  Z_DEFAULT_CHUNK,
  Z_MIN_MEMLEVEL,
  Z_MAX_MEMLEVEL,
  Z_DEFAULT_MEMLEVEL,
  Z_MIN_LEVEL,
  Z_MAX_LEVEL,
  Z_DEFAULT_LEVEL: Z_DEFAULT_COMPRESSION,
  createDeflate,
  createInflate,
  createDeflateRaw,
  createInflateRaw,
  createGzip,
  createGunzip,
  createUnzip,
  deflate,
  deflateSync,
  gzip,
  gzipSync,
  deflateRaw,
  deflateRawSync,
  unzip,
  unzipSync,
  inflate,
  inflateSync,
  gunzip,
  gunzipSync,
  inflateRaw,
  inflateRawSync,
};

export {
  Deflate,
  Inflate,
  Gzip,
  Gunzip,
  DeflateRaw,
  InflateRaw,
  Unzip,
  codes,
  Z_NO_FLUSH,
  Z_PARTIAL_FLUSH,
  Z_SYNC_FLUSH,
  Z_FULL_FLUSH,
  Z_FINISH,
  Z_BLOCK,
  Z_TREES,
  Z_OK,
  Z_STREAM_END,
  Z_NEED_DICT,
  Z_ERRNO,
  Z_STREAM_ERROR,
  Z_DATA_ERROR,
  Z_MEM_ERROR,
  Z_BUF_ERROR,
  Z_NO_COMPRESSION,
  Z_BEST_SPEED,
  Z_BEST_COMPRESSION,
  Z_DEFAULT_COMPRESSION,
  Z_FILTERED,
  Z_HUFFMAN_ONLY,
  Z_RLE,
  Z_FIXED,
  Z_DEFAULT_STRATEGY,
  Z_BINARY,
  Z_TEXT,
  Z_UNKNOWN,
  Z_DEFLATED,
  Z_MIN_WINDOWBITS,
  Z_MAX_WINDOWBITS,
  Z_DEFAULT_WINDOWBITS,
  Z_MIN_CHUNK,
  Z_MAX_CHUNK,
  Z_DEFAULT_CHUNK,
  Z_MIN_MEMLEVEL,
  Z_MAX_MEMLEVEL,
  Z_DEFAULT_MEMLEVEL,
  Z_MIN_LEVEL,
  Z_MAX_LEVEL,
  Z_DEFAULT_LEVEL,
  createDeflate,
  createInflate,
  createDeflateRaw,
  createInflateRaw,
  createGzip,
  createGunzip,
  createUnzip,
  deflate,
  deflateSync,
  gzip,
  gzipSync,
  deflateRaw,
  deflateRawSync,
  unzip,
  unzipSync,
  inflate,
  inflateSync,
  gunzip,
  gunzipSync,
  inflateRaw,
  inflateRawSync,
};
