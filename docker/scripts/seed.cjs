const net = require("node:net");
const admin = require("../../functions/node_modules/firebase-admin");

const projectId = process.env.FIREBASE_PROJECT_ID || "demo-stock-league-event-local";
const email = process.env.LOCAL_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.LOCAL_ADMIN_PASSWORD;

function validateBootstrapCredentials() {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("LOCAL_ADMIN_EMAIL must be a valid email address.");
  }

  if (!password || password.length < 16 || password === "replace-with-a-unique-password-at-least-16-characters") {
    throw new Error("LOCAL_ADMIN_PASSWORD must be a unique password of at least 16 characters.");
  }
}

const waitForPort = (host, port, timeoutMillis = 120_000) => new Promise((resolve, reject) => {
  const startedAt = Date.now();
  const attempt = () => {
    const socket = net.createConnection({ host, port });
    socket.once("connect", () => {
      socket.destroy();
      resolve();
    });
    socket.once("error", () => {
      socket.destroy();
      if (Date.now() - startedAt >= timeoutMillis) {
        reject(new Error(`Timed out waiting for ${host}:${port}`));
        return;
      }
      setTimeout(attempt, 1_000);
    });
  };
  attempt();
});

async function main() {
  validateBootstrapCredentials();
  await waitForPort("firebase", 8080);
  await waitForPort("firebase", 9099);

  admin.initializeApp({ projectId, storageBucket: `${projectId}.appspot.com` });
  const auth = admin.auth();
  const db = admin.firestore();

  let user;
  try {
    user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { password, emailVerified: true, disabled: false });
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
    user = await auth.createUser({ email, password, emailVerified: true });
  }

  await auth.setCustomUserClaims(user.uid, { admin: true, coreAdmin: true });

  const batch = db.batch();
  batch.set(db.collection("admins").doc(email), {
    email,
    role: "core",
    localBootstrap: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.set(db.collection("settings").doc("system"), {
    globalPhase: "STOP",
    scenarioMode: "AUTO",
    schedules: [],
    initialPoint: "10000",
    localBootstrap: true,
  }, { merge: true });
  batch.set(db.collection("settings").doc("prizes"), { grades: [] }, { merge: true });
  await batch.commit();

  console.log(`Local admin is ready: ${email}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
