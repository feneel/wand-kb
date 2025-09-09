// lib/firebase.ts
import "server-only";
import { Firestore } from "@google-cloud/firestore";

declare global { var __FIRESTORE__: Firestore | undefined; }

function makeFirestore(): Firestore {
  // <- we read your project id from env and pass it explicitly
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCP_PROJECT;

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (clientEmail && privateKey) {
    if (!projectId) throw new Error("Missing FIREBASE_PROJECT_ID for hosted env");
    return new Firestore({
      projectId,
      credentials: { client_email: clientEmail, private_key: privateKey },
    });
  }

  // local dev via key file
  const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyFilename) {
    return new Firestore({ projectId, keyFilename });
  }

  // final fallback (ADC). Still passes projectId if you set it.
  return new Firestore({ projectId });
}

export const db =
  globalThis.__FIRESTORE__ ?? (globalThis.__FIRESTORE__ = makeFirestore());
