import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const appOrigin = "http://127.0.0.1:4173";
const targetOrigin = "http://127.0.0.1:4174";
const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const chunk = Buffer.alloc(64 * 1024, 0x5a);
const decodedCompressedFixture = Buffer.from("url-speed-test-".repeat(400_000));
const encodedCompressedFixture = gzipSync(decodedCompressedFixture);

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
]);

function sendJson(response, status, value) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}

async function serveStatic(request, response) {
  const requestUrl = new URL(request.url, appOrigin);
  if (requestUrl.pathname === "/healthz") {
    response.writeHead(204, { "cache-control": "no-store" });
    response.end();
    return;
  }
  if (requestUrl.pathname === "/targets.json") {
    sendJson(response, 200, {
      targets: [
        {
          id: "local-stream",
          label: "Local streaming fixture",
          url: `${targetOrigin}/download.bin?token=preset-token`,
        },
      ],
    });
    return;
  }

  const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const absolutePath = resolve(root, `.${decodeURIComponent(pathname)}`);
  if (absolutePath !== root && !absolutePath.startsWith(`${root}${sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const metadata = await stat(absolutePath);
    if (!metadata.isFile()) throw new Error("not a file");
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-length": metadata.size,
      "content-type": mimeTypes.get(extname(absolutePath)) ?? "application/octet-stream",
    });
    createReadStream(absolutePath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

function requestHasExpectedToken(request) {
  const requestUrl = new URL(request.url, targetOrigin);
  const tokens = requestUrl.searchParams.getAll("token");
  const allowedToken = tokens[0] === "manual-secret" || tokens[0] === "preset-token";
  const exactQuery = requestUrl.searchParams.size === 1 && tokens.length === 1;
  return allowedToken && exactQuery;
}

function rejectChangedUrl(response) {
  response.writeHead(400, { "access-control-allow-origin": appOrigin });
  response.end("The request URL was changed");
}

function streamFixture(request, response, { chunkCount = 48, timingAllowed }) {
  if (!requestHasExpectedToken(request)) {
    rejectChangedUrl(response);
    return;
  }

  const headers = {
    "access-control-allow-origin": appOrigin,
    "cache-control": "no-store",
    "content-length": chunk.length * chunkCount,
    "content-type": "application/octet-stream",
  };
  if (timingAllowed) headers["timing-allow-origin"] = appOrigin;
  response.writeHead(200, headers);

  let remaining = chunkCount;
  const writeNext = () => {
    if (response.destroyed) return;
    if (remaining === 0) {
      response.end();
      return;
    }
    remaining -= 1;
    response.write(chunk);
    setTimeout(writeNext, 14);
  };
  writeNext();
}

function streamCompressedFixture(request, response) {
  if (!requestHasExpectedToken(request)) {
    rejectChangedUrl(response);
    return;
  }

  response.writeHead(200, {
    "access-control-allow-origin": appOrigin,
    "access-control-expose-headers": "Content-Encoding",
    "cache-control": "no-store",
    "content-encoding": "gzip",
    "content-length": encodedCompressedFixture.length,
    "content-type": "application/octet-stream",
    "timing-allow-origin": appOrigin,
  });

  let offset = 0;
  const writeNext = () => {
    if (response.destroyed) return;
    if (offset >= encodedCompressedFixture.length) {
      response.end();
      return;
    }
    const nextOffset = Math.min(offset + 1_024, encodedCompressedFixture.length);
    response.write(encodedCompressedFixture.subarray(offset, nextOffset));
    offset = nextOffset;
    setTimeout(writeNext, 14);
  };
  writeNext();
}

const appServer = createServer((request, response) => {
  serveStatic(request, response).catch((error) => {
    console.error(error);
    if (!response.headersSent) response.writeHead(500);
    response.end("Internal error");
  });
});

const targetServer = createServer((request, response) => {
  const requestUrl = new URL(request.url, targetOrigin);
  if (requestUrl.pathname === "/download.bin") {
    streamFixture(request, response, { timingAllowed: true });
    return;
  }
  if (requestUrl.pathname === "/long.bin") {
    streamFixture(request, response, { chunkCount: 240, timingAllowed: true });
    return;
  }
  if (requestUrl.pathname === "/no-tao.bin") {
    streamFixture(request, response, { timingAllowed: false });
    return;
  }
  if (requestUrl.pathname === "/compressed.bin") {
    streamCompressedFixture(request, response);
    return;
  }
  response.writeHead(404, { "access-control-allow-origin": appOrigin });
  response.end("Not found");
});

await Promise.all([
  new Promise((resolveListen) => appServer.listen(4173, "127.0.0.1", resolveListen)),
  new Promise((resolveListen) => targetServer.listen(4174, "127.0.0.1", resolveListen)),
]);

console.log(`Test app listening on ${appOrigin}; target on ${targetOrigin}`);

function shutdown() {
  appServer.close();
  targetServer.close();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
