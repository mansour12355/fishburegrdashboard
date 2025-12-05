// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAbkJpVWRXfOuG-VDp0dC0oGkPKo9VCZD0",
    authDomain: "fishburger-system.firebaseapp.com",
    projectId: "fishburger-system",
    storageBucket: "fishburger-system.firebasestorage.app",
    messagingSenderId: "1011829893886",
    appId: "1:1011829893886:web:626820e2eb475b2b45d3af",
    measurementId: "G-LHF8XPTL3G"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

export { app, analytics, db };
