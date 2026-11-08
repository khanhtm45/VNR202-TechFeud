// Copy the Firebase WEB APP configuration here after creating your own project.
// This is a client identifier, NOT an Admin SDK key. Never place a service account here.
// Cloud Functions and Firestore must be deployed from this repository first.
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  appId: ""
};
export const functionsRegion = "asia-southeast1";
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
