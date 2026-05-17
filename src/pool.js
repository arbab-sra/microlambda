// // src/pool.js
// const FirecrackerExecutor = require("./executor");
// const config = require("../config");

// class VMPool {
//   constructor() {
//     this.warmVMs = []; // ready VMs waiting to be used
//     this.vmIdCounter = 1;
//     this.booting = 0; // how many VMs are currently booting
//   }

//   // Called at startup — pre-warm N VMs
//   async initialize() {
//     console.log(`[pool] Pre-warming ${config.POOL_SIZE} VMs...`);
//     const promises = Array.from({ length: config.POOL_SIZE }, () =>
//       this._bootOneVM(),
//     );
//     await Promise.all(promises);
//     console.log(`[pool] Ready. ${this.warmVMs.length} VMs warm.`);
//   }

//   async _bootOneVM() {
//     const id = this.vmIdCounter++;
//     this.booting++;
//     try {
//       const vm = new FirecrackerExecutor(id);
//       await vm.boot();
//       this.warmVMs.push(vm);
//     } catch (err) {
//       console.error(`[pool] Failed to boot VM ${id}:`, err.message);
//     } finally {
//       this.booting--;
//     }
//   }

//   // Acquire a VM for execution (warm if available, else cold start)
//   async acquire() {
//     if (this.warmVMs.length > 0) {
//       const vm = this.warmVMs.shift(); // grab from front
//       console.log(
//         `[pool] Assigned warm VM ${vm.vmId}. ${this.warmVMs.length} remaining.`,
//       );

//       // Async: boot a replacement so pool stays full
//       this._bootOneVM().catch(console.error);

//       return vm;
//     }

//     // Cold start — no warm VMs available
//     console.log("[pool] Cold start! No warm VMs.");
//     const vm = new FirecrackerExecutor(this.vmIdCounter++);
//     await vm.boot();
//     return vm;
//   }

//   // After execution, decide: recycle or destroy?
//   async release(vm, shouldRecycle = true) {
//     if (shouldRecycle && this.warmVMs.length < config.POOL_SIZE) {
//       // The agent is still running inside, VM is still alive
//       // We can reuse it for the next invocation!
//       this.warmVMs.push(vm);
//       console.log(`[pool] VM ${vm.vmId} returned to pool.`);
//     } else {
//       // Pool is full or VM had errors — destroy it
//       await vm.destroy();
//     }
//   }

//   get stats() {
//     return {
//       warm: this.warmVMs.length,
//       booting: this.booting,
//       total: this.vmIdCounter - 1,
//     };
//   }
// }

// module.exports = new VMPool();
// src/pool.js
const MockExecutor = require('./executor.mock');

const POOL_SIZE = 3; // Mac pe 3 enough hai testing ke liye

class VMPool {
  constructor() {
    this.warm = [];
    this.idCounter = 1;
    this.bootingCount = 0;
  }

  async initialize() {
    console.log(`[pool] Pre-warming ${POOL_SIZE} mock VMs...`);
    await Promise.all(Array.from({ length: POOL_SIZE }, () => this._bootOne()));
    console.log(`[pool] Ready! ${this.warm.length} VMs warm.`);
  }

  async _bootOne() {
    this.bootingCount++;
    try {
      const vm = new MockExecutor(this.idCounter++);
      await vm.boot();
      this.warm.push(vm);
    } catch (e) {
      console.error('[pool] Boot failed:', e.message);
    } finally {
      this.bootingCount--;
    }
  }

  async acquire() {
    if (this.warm.length > 0) {
      const vm = this.warm.shift();
      console.log(`[pool] Warm VM ${vm.vmId} assigned. Pool: ${this.warm.length} left`);
      this._bootOne(); // replenish async
      return { vm, wasWarm: true };
    }
    console.log('[pool] Cold start!');
    const vm = new MockExecutor(this.idCounter++);
    await vm.boot();
    return { vm, wasWarm: false };
  }

  async release(vm, healthy = true) {
    if (healthy && this.warm.length < POOL_SIZE) {
      this.warm.push(vm);
      console.log(`[pool] VM ${vm.vmId} recycled. Pool: ${this.warm.length}`);
    } else {
      await vm.destroy();
    }
  }

  get stats() {
    return { warm: this.warm.length, booting: this.bootingCount, totalCreated: this.idCounter - 1 };
  }
}

module.exports = new VMPool();