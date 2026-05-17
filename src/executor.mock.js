// src/executor.mock.js
const vm = require("vm");

class MockExecutor {
  constructor(vmId) {
    this.vmId = vmId;
    this.booted = false;
  }

  async boot() {
    // Simulate ~125ms cold start
    await new Promise((r) => setTimeout(r, 125));
    this.booted = true;
    console.log(`[mock-executor] VM ${this.vmId} "booted"`);
    return this;
  }

  async run(fnConfig, event) {
    const startTime = Date.now();

    try {
      // Sandbox: function ke paas limited globals milte hain
      const sandbox = {
        module: { exports: {} },
        exports: {},
        console,
        setTimeout,
        clearTimeout,
        Promise,
        require: (mod) => {
          // Only allow safe built-in modules
          const allowed = ["crypto", "path", "url", "querystring"];
          if (allowed.includes(mod)) return require(mod);
          throw new Error(`require('${mod}') not allowed in sandbox`);
        },
      };

      // Run the function code in the sandbox
      const script = new vm.Script(`
        (function(module, exports, require, console) {
          ${fnConfig.code}
        })(module, module.exports, require, console);
      `);

      const context = vm.createContext(sandbox);
      script.runInContext(context);

      // Get the handler
      const handlerFn =
        sandbox.module.exports[fnConfig.handler] ||
        sandbox.module.exports.handler;

      if (typeof handlerFn !== "function") {
        throw new Error(`Handler "${fnConfig.handler}" not found`);
      }

      // Execute with timeout
      const result = await Promise.race([
        new Promise((resolve, reject) => {
          const ret = handlerFn(event, {}, (err, data) => {
            if (err) reject(err);
            else resolve(data);
          });
          if (ret && typeof ret.then === "function") {
            ret.then(resolve).catch(reject);
          } else if (ret !== undefined) {
            resolve(ret);
          }
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), fnConfig.timeout),
        ),
      ]);

      return {
        success: true,
        result,
        executionMs: Date.now() - startTime,
        vmId: this.vmId,
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        executionMs: Date.now() - startTime,
        vmId: this.vmId,
      };
    }
  }

  async destroy() {
    this.booted = false;
    console.log(`[mock-executor] VM ${this.vmId} destroyed`);
  }
}

module.exports = MockExecutor;
