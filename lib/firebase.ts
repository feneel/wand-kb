import { Firestore } from "@google-cloud/firestore";
import { Storage } from "@google-cloud/storage";

export const db = new Firestore(); // uses GOOGLE_APPLICATION_CREDENTIALS
export const storage = process.env.GCS_BUCKET
  ? new Storage().bucket(process.env.GCS_BUCKET)
  : null;
