// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDe5mMqwFkkvCAeVAHN0ud-5CsKu5S5wMo",
  authDomain: "cambio-backend.firebaseapp.com",
  databaseURL: "https://cambio-backend-default-rtdb.firebaseio.com",
  projectId: "cambio-backend",
  storageBucket: "cambio-backend.firebasestorage.app",
  messagingSenderId: "856245067053",
  appId: "1:856245067053:web:cb5c2e375bb2afca0907a4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export { database };
