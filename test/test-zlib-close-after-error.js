// https://github.com/nodejs/node/issues/6034

import common from "./common.js";
import assert from "assert";
import zlib from "../src/index.js";

const decompress = zlib.createGunzip(15);

decompress.on(
  "error",
  common.mustCall((err) => {
    assert.strictEqual(decompress._closed, true);
    assert.doesNotThrow(() => decompress.close());
  })
);

assert.strictEqual(decompress._closed, false);
decompress.write("something invalid");
