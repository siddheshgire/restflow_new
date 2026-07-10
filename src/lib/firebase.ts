import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  projectId: "bionic-compiler-wsjh2",
  appId: "1:530992808798:web:91a3965c52ff5e3115c5cf",
  apiKey: "AIzaSyAZI50YD9JoMaDNtoj_Jb5LdmadZUX9LDU",
  authDomain: "bionic-compiler-wsjh2.firebaseapp.com",
  storageBucket: "bionic-compiler-wsjh2.firebasestorage.app",
  messagingSenderId: "530992808798",
  firestoreDatabaseId: "ai-studio-4aa2c1c2-4855-428b-bc45-d9f11bbcbbe3"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
