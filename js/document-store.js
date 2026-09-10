import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import { auth, cloudFunctions } from "./firebase.js";

async function invoke(name, data = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Bitte zuerst anmelden.");
  const idToken = await user.getIdToken();
  const fn = httpsCallable(cloudFunctions, name);
  const result = await fn({ idToken, ...data });
  return result.data || {};
}

export async function fileToBase64(file) {
  if (!file) return "";
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",").pop() || "");
    reader.onerror = () => reject(reader.error || new Error("Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

export function portalCall(name, data = {}) { return invoke(name, data); }

export async function uploadPayload(file) {
  if (!file) return null;
  return {
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
    size: file.size || 0,
    base64Data: await fileToBase64(file)
  };
}
