import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
  try {
    const outletsSnap = await getDocs(collection(db, "outlets"));
    console.log(`Total Outlets: ${outletsSnap.size}`);
    outletsSnap.forEach(doc => {
      console.log(`- Name: ${doc.data().name} | Location: ${doc.data().location}`);
    });
  } catch (err) {
    console.error(err);
  }
}
run();
