/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  limit,
  serverTimestamp 
} from 'firebase/firestore';
import { UserRole, UserProfile } from '../types';

const firebaseConfig = {
  projectId: "rare-tape-xn50x",
  appId: "1:436167359413:web:08dd3a9ce4042478d937fc",
  apiKey: "AIzaSyDRRT50qLxnxlON-Lxdmm4qsauxf7Se8nc",
  authDomain: "rare-tape-xn50x.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-add6b86b-3d07-4147-bbc9-b88a461b191e",
  storageBucket: "rare-tape-xn50x.firebasestorage.app",
  messagingSenderId: "436167359413"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Helper to convert Username to DMS Email
export const usernameToEmail = (username: string): string => {
  const sanitized = username.trim().toLowerCase();
  return sanitized.includes('@') ? sanitized : `${sanitized}@samira.dms`;
};

// Create a separate auth instance to create users without logging out the admin!
export const createNewUserAuth = async (username: string, password: string): Promise<string> => {
  const tempApp = initializeApp(firebaseConfig, `TempApp_${Date.now()}`);
  const tempAuth = getAuth(tempApp);
  try {
    const email = usernameToEmail(username);
    const userCredential = await createUserWithEmailAndPassword(tempAuth, email, password);
    const uid = userCredential.user.uid;
    await signOut(tempAuth);
    return uid;
  } finally {
    // Clean up the temporary app instance
    try {
      // Small timeout or immediate app delete to prevent resource leakage
      setTimeout(() => {
        tempApp.automaticDataCollectionEnabled = false;
      }, 100);
    } catch (e) {
      console.error("TempApp cleanup error", e);
    }
  }
};

// Seed initial Admin user in Firestore & Auth if none exists
export const seedInitialAdmin = async () => {
  try {
    const usersColRef = collection(db, 'users');
    const q = query(usersColRef, limit(1));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.log('Seeding default admin user...');
      const adminUsername = 'admin';
      const adminPassword = 'admin123';
      const adminEmail = usernameToEmail(adminUsername);

      // Create Admin in Firebase Auth
      let uid = '';
      try {
        const cred = await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
        uid = cred.user.uid;
      } catch (authError: any) {
        if (authError.code === 'auth/user-not-found' || authError.code === 'auth/invalid-credential') {
          // User doesn't exist, let's create them
          try {
            const cred = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
            uid = cred.user.uid;
          } catch (createError: any) {
            console.log('Firebase Auth is not configured or email/password sign-in is disabled. Falling back to local Firestore login.');
            uid = 'admin_fallback_uid';
          }
        } else if (authError.code === 'auth/operation-not-allowed') {
          console.log('Firebase Auth Email/Password sign-in provider is disabled. Falling back to Firestore-only users.');
          uid = 'admin_fallback_uid';
        } else {
          console.log('Auth setup note during seed:', authError.message || authError);
          uid = 'admin_fallback_uid';
        }
      }

      if (uid) {
        const adminProfile: UserProfile = {
          id: uid,
          username: adminUsername,
          name: 'Super Admin (Samira Traders)',
          role: UserRole.SUPER_ADMIN,
          phone: '01712345678',
          status: 'ACTIVE',
          createdAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'users', uid), adminProfile);
        console.log('Admin user seeded successfully with ID:', uid);
      }
    }
  } catch (error) {
    console.error('Error seeding initial admin:', error);
  }
};
