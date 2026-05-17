// config.js
module.exports = {
  FIRECRACKER_BIN: "/usr/local/bin/firecracker",
  KERNEL_PATH: "/opt/microlambda/kernel/vmlinux.bin",
  ROOTFS_PATH: "/opt/microlambda/rootfs/base.ext4",

  SOCKET_BASE: "/tmp/fc-sockets", // one socket per VM
  TAP_BASE: "tap", // tap0, tap1, tap2...
  VM_SUBNET: "172.16", // 172.16.X.1 = host, .2 = guest

  POOL_SIZE: 5, // pre-warm 5 VMs always
  AGENT_PORT: 7000, // port inside every microVM
  FUNCTION_TIMEOUT_MS: 30_000, // max execution time
};
