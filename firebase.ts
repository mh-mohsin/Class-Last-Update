// Standard Firebase v9+ modular imports
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyB5wX_YkXsc9WEyLYT5xKkncLpGfUHfJ2I",
  authDomain: "class-management-9c570.firebaseapp.com",
  projectId: "class-management-9c570",
  storageBucket: "class-management-9c570.firebasestorage.app",
  messagingSenderId: "739807768215",
  appId: "1:739807768215:web:29c899d4005860dcbc43d2",
  measurementId: "G-JDE1NZKN5X"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

/*
  FIREBASE SECURITY RULES:
  
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /classes/{classId} {
        // For the demo, allow any authenticated user to seed or manage classes
        allow read: if request.auth != null;
        allow write: if request.auth != null;
      }
      match /users/{userId} {
        allow read: if request.auth != null;
        allow write: if false;
      }
    }
  }
*/