// // src/registry.js
// const fs = require("fs").promises;
// const path = require("path");

// const REGISTRY_DIR = "/opt/microlambda/functions";

// class FunctionRegistry {
//   async save(
//     name,
//     { code, handler = "handler", timeout = 30000, memory = 128 },
//   ) {
//     const dir = path.join(REGISTRY_DIR, name);
//     await fs.mkdir(dir, { recursive: true });

//     const meta = { name, handler, timeout, memory, createdAt: Date.now() };

//     await fs.writeFile(path.join(dir, "index.js"), code);
//     await fs.writeFile(path.join(dir, "meta.json"), JSON.stringify(meta));

//     console.log(`[registry] Saved function: ${name}`);
//     return meta;
//   }

//   async get(name) {
//     const dir = path.join(REGISTRY_DIR, name);
//     try {
//       const [code, metaRaw] = await Promise.all([
//         fs.readFile(path.join(dir, "index.js"), "utf8"),
//         fs.readFile(path.join(dir, "meta.json"), "utf8"),
//       ]);
//       return { code, ...JSON.parse(metaRaw) };
//     } catch {
//       throw new Error(`Function "${name}" not found`);
//     }
//   }

//   async list() {
//     try {
//       const entries = await fs.readdir(REGISTRY_DIR);
//       const metas = await Promise.all(
//         entries.map(async (name) => {
//           const raw = await fs.readFile(
//             path.join(REGISTRY_DIR, name, "meta.json"),
//             "utf8",
//           );
//           return JSON.parse(raw);
//         }),
//       );
//       return metas;
//     } catch {
//       return [];
//     }
//   }
// }

// module.exports = new FunctionRegistry();
// src/registry.js
const fs = require('fs').promises;
const path = require('path');

const STORE = path.join(__dirname, '..', 'functions-store');

class FunctionRegistry {
  async save(name, { code, handler = 'handler', timeout = 5000, memory = 128 }) {
    await fs.mkdir(path.join(STORE, name), { recursive: true });
    const meta = { name, handler, timeout, memory, createdAt: Date.now() };
    await fs.writeFile(path.join(STORE, name, 'index.js'), code);
    await fs.writeFile(path.join(STORE, name, 'meta.json'), JSON.stringify(meta, null, 2));
    return meta;
  }

  async get(name) {
    try {
      const [code, raw] = await Promise.all([
        fs.readFile(path.join(STORE, name, 'index.js'), 'utf8'),
        fs.readFile(path.join(STORE, name, 'meta.json'), 'utf8'),
      ]);
      return { code, ...JSON.parse(raw) };
    } catch {
      throw new Error(`Function "${name}" not found`);
    }
  }

  async list() {
    try {
      const dirs = await fs.readdir(STORE);
      return Promise.all(
        dirs.map(async d => {
          const raw = await fs.readFile(path.join(STORE, d, 'meta.json'), 'utf8');
          return JSON.parse(raw);
        })
      );
    } catch { return []; }
  }

  async delete(name) {
    await fs.rm(path.join(STORE, name), { recursive: true, force: true });
  }
}

module.exports = new FunctionRegistry();