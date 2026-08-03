const net = require("node:net");
const admin = require("../../functions/node_modules/firebase-admin");

const projectId = process.env.FIREBASE_PROJECT_ID || "demo-stock-league-event-local";
const wait = millis => new Promise(resolve => setTimeout(resolve, millis));

const waitForPort = (host, port) => new Promise(resolve => {
  const attempt = () => {
    const socket = net.createConnection({ host, port });
    socket.once("connect", () => {
      socket.destroy();
      resolve();
    });
    socket.once("error", () => {
      socket.destroy();
      setTimeout(attempt, 1_000);
    });
  };
  attempt();
});

async function main() {
  await waitForPort("firebase", 8080);
  admin.initializeApp({ projectId, storageBucket: `${projectId}.appspot.com` });

  const { scheduleHeartbeats } = require("../../functions/lib/scheduler.js");
  const { cleanupExpiredTradeQuotes } = require("../../functions/lib/quoteCleanup.js");
  const { performStockTick } = require("../../functions/lib/worker.js");

  let lastMinuteRun = 0;
  console.log("Local scheduler/worker runner started.");

  while (true) {
    const now = Date.now();
    try {
      if (now - lastMinuteRun >= 60_000) {
        const scheduleTime = new Date(now).toISOString();
        await scheduleHeartbeats.run({ scheduleTime });
        await cleanupExpiredTradeQuotes.run({ scheduleTime });
        lastMinuteRun = now;
      }

      await performStockTick.run({
        data: { tickIndex: 0 },
        queueName: "local-runner",
        id: `local-${now}`,
        retryCount: 0,
        executionCount: 0,
        scheduledTime: new Date(now).toISOString(),
      });
    } catch (error) {
      console.error("Local scheduled execution failed:", error);
    }
    await wait(30_000);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
