
const express = require('express');
const registry = require('./registry');
const pool = require('./pool');

const app = express();
app.use(express.json({ limit: '5mb' }));

// ── Deploy ────────────────────────────────────────────
app.post('/functions', async (req, res) => {
  try {
    const { name, code, handler, timeout, memory } = req.body;
    if (!name || !code) return res.status(400).json({ error: 'name and code required' });
    const meta = await registry.save(name, { code, handler, timeout, memory });
    res.status(201).json({ ok: true, ...meta });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── List ──────────────────────────────────────────────
app.get('/functions', async (req, res) => {
  res.json({ functions: await registry.list() });
});

// ── Delete ────────────────────────────────────────────
app.delete('/functions/:name', async (req, res) => {
  await registry.delete(req.params.name);
  res.json({ ok: true, deleted: req.params.name });
});

// ── Invoke ────────────────────────────────────────────
app.post('/invoke/:name', async (req, res) => {
  const t0 = Date.now();
  let handle = null;

  try {
    const fnConfig = await registry.get(req.params.name);
    handle = await pool.acquire();

    const result = await handle.vm.run(fnConfig, req.body);
    await pool.release(handle.vm, result.success);
    handle = null;

    res.json({
      ...result,
      function: req.params.name,
      coldStart: !handle?.wasWarm,
      totalMs: Date.now() - t0,
    });
  } catch (e) {
    if (handle) await pool.release(handle.vm, false);
    res.status(500).json({ error: e.message, totalMs: Date.now() - t0 });
  }
});

// ── Pool Stats ────────────────────────────────────────
app.get('/pool/stats', (req, res) => res.json(pool.stats));

// ── Health ────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

async function start() {
  await pool.initialize();
  app.listen(3000, () => console.log('\n[gateway] MicroLambda running at http://localhost:3000\n'));
}

start().catch(console.error);