import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const destination = join(root, "public", "vad");
await mkdir(destination, { recursive: true });
const assets = [
  ["@ricky0123/vad-web", "silero_vad_v5.onnx"],
  ["@ricky0123/vad-web", "vad.worklet.bundle.min.js"],
  ["onnxruntime-web", "ort-wasm-simd-threaded.wasm"],
  ["onnxruntime-web", "ort-wasm-simd-threaded.mjs"],
];
await Promise.all(
  assets.map(([pkg, file]) =>
    copyFile(
      join(root, "node_modules", pkg, "dist", file),
      join(destination, file),
    ),
  ),
);
await writeFile(
  join(destination, "SOURCES.txt"),
  [
    "Local voice activity detection assets; no CDN is used at runtime.",
    "Silero VAD v5: MIT, https://github.com/snakers4/silero-vad",
    "@ricky0123/vad-web 0.0.31: ISC, https://github.com/ricky0123/vad",
    "ONNX Runtime Web 1.22.0: MIT, https://github.com/microsoft/onnxruntime",
    "The runtime JS and WASM must be copied from the same installed version.",
    "",
  ].join("\n"),
);
const mit = (copyright) => `MIT License

${copyright}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
await writeFile(
  join(destination, "LICENSE-SILERO.txt"),
  mit("Copyright (c) 2020-present Silero Team"),
);
await writeFile(
  join(destination, "LICENSE-ONNXRUNTIME.txt"),
  mit("Copyright (c) Microsoft Corporation"),
);
await writeFile(
  join(destination, "LICENSE-VAD-WEB.txt"),
  `ISC License

Copyright (c) 2022-present ricky0123

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.
THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
`,
);
console.log(`Prepared ${assets.length} local VAD assets.`);
