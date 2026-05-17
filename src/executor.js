// src/executor.js
const { execFile, spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");
const config = require("../config");

class FirecrackerExecutor {
  constructor(vmId) {
    this.vmId = vmId;
    this.socketPath = `${config.SOCKET_BASE}/fc-${vmId}.sock`;
    this.tapName = `${config.TAP_BASE}${vmId}`;
    this.guestIp = `${config.VM_SUBNET}.${vmId}.2`;
    this.hostIp = `${config.VM_SUBNET}.${vmId}.1`;
    this.process = null;
  }

  // Make a REST call to Firecracker's Unix socket
  _fc(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const opts = {
        socketPath: this.socketPath,
        path,
        method,
        headers: { "Content-Type": "application/json" },
      };
      const req = http.request(opts, (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      });
      req.on("error", reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async boot() {
    // Create socket dir
    fs.mkdirSync(config.SOCKET_BASE, { recursive: true });

    // Setup TAP network device for this VM
    await this._setupNetwork();

    // Spawn the Firecracker process
    this.process = spawn(config.FIRECRACKER_BIN, [
      "--api-sock",
      this.socketPath,
      "--log-path",
      `/tmp/fc-${this.vmId}.log`,
    ]);

    // Wait for socket to appear
    await this._waitForSocket();

    // Configure the VM via REST API
    await this._fc("PUT", "/boot-source", {
      kernel_image_path: config.KERNEL_PATH,
      boot_args: "console=ttyS0 reboot=k panic=1 pci=off",
    });

    await this._fc("PUT", "/drives/rootfs", {
      drive_id: "rootfs",
      path_on_host: config.ROOTFS_PATH,
      is_root_device: true,
      is_read_only: false,
    });

    await this._fc("PUT", "/machine-config", {
      vcpu_count: 1,
      mem_size_mib: 128,
    });

    await this._fc("PUT", `/network-interfaces/eth0`, {
      iface_id: "eth0",
      guest_mac: `AA:FC:00:00:00:${String(this.vmId).padStart(2, "0")}`,
      host_dev_name: this.tapName,
    });

    // BOOT!
    await this._fc("PUT", "/actions", { action_type: "InstanceStart" });

    // Wait for agent to be ready
    await this._waitForAgent();

    console.log(`[executor] VM ${this.vmId} booted. IP: ${this.guestIp}`);
    return this;
  }

  async _setupNetwork() {
    const run = (cmd) =>
      new Promise((res, rej) =>
        execFile("bash", ["-c", cmd], (err, out) =>
          err ? rej(err) : res(out),
        ),
      );

    await run(`ip tuntap add ${this.tapName} mode tap 2>/dev/null || true`);
    await run(
      `ip addr add ${this.hostIp}/30 dev ${this.tapName} 2>/dev/null || true`,
    );
    await run(`ip link set ${this.tapName} up`);
  }

  _waitForSocket(timeout = 5000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (fs.existsSync(this.socketPath)) return resolve();
        if (Date.now() - start > timeout)
          return reject(new Error("Socket timeout"));
        setTimeout(check, 100);
      };
      setTimeout(check, 200); // give firecracker a moment to start
    });
  }

  _waitForAgent(timeout = 10000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const tryConnect = () => {
        const req = http.request(
          {
            host: this.guestIp,
            port: config.AGENT_PORT,
            path: "/health",
            method: "GET",
          },
          (res) => {
            if (res.statusCode === 200) resolve();
            else retry();
          },
        );
        req.on("error", retry);
        req.end();
      };
      const retry = () => {
        if (Date.now() - start > timeout)
          return reject(new Error("Agent timeout"));
        setTimeout(tryConnect, 300);
      };
      tryConnect();
    });
  }

  // Send function code + event to the in-VM agent
  async run(fnConfig, event) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        code: fnConfig.code,
        handler: fnConfig.handler,
        event,
      });

      const req = http.request(
        {
          host: this.guestIp,
          port: config.AGENT_PORT,
          path: "/run",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
          timeout: fnConfig.timeout,
        },
        (res) => {
          let data = "";
          res.on("data", (d) => (data += d));
          res.on("end", () => resolve(JSON.parse(data)));
        },
      );

      req.on("error", reject);
      req.on("timeout", () => reject(new Error("Function execution timeout")));
      req.write(body);
      req.end();
    });
  }

  async destroy() {
    if (this.process) {
      this.process.kill("SIGKILL");
      this.process = null;
    }
    try {
      fs.unlinkSync(this.socketPath);
    } catch {}
    console.log(`[executor] VM ${this.vmId} destroyed`);
  }
}

module.exports = FirecrackerExecutor;
