// src/agent/server.js
// This runs INSIDE the microVM (baked into rootfs)
const http = require("http");
const vm = require("vm"); // Node.js sandboxed execution

const PORT = 7000;

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/run") {
    res.writeHead(404);
    return res.end("Not found");
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { code, event, handler } = JSON.parse(body);

      // Dynamically load function code into a sandboxed module
      const module = { exports: {} };
      const wrapped = `(function(module, exports, require) { ${code} })`;

      const fn = vm.runInThisContext(wrapped);
      fn(module, module.exports, require);

      // Call the handler function
      const handlerFn = module.exports[handler] || module.exports.handler;

      if (typeof handlerFn !== "function") {
        throw new Error(`Handler "${handler}" not found in function code`);
      }

      // Support both async and callback-style handlers
      const result = await new Promise((resolve, reject) => {
        const ret = handlerFn(event, {}, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
        if (ret && typeof ret.then === "function") {
          ret.then(resolve).catch(reject);
        }
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, result }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[agent] Listening on :${PORT}`);
});
