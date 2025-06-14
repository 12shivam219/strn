module.exports = {
  apps: [
    {
      name: "mediasoup-server",
      script: "./mediasoup-server/index.ts",
      interpreter: "node",
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "auth-streaming-server",
      script: "./auth-streaming-server/index.ts",
      interpreter: "node",
      watch: false,
      max_memory_restart: "200M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
