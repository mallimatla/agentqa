'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../../src/config/firebase';
import { userService, UserProfile } from '../../src/services/firestore';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);

      if (user) {
        // Fetch or create user profile
        let userProfile = await userService.get(user.uid);
        if (!userProfile) {
          // Create new profile
          await userService.create(user.uid, {
            email: user.email || '',
            displayName: user.displayName || user.email?.split('@')[0] || 'User',
            photoURL: user.photoURL || undefined,
          });
          userProfile = await userService.get(user.uid);
        } else {
          // Update last login
          await userService.update(user.uid, {});
        }
        setProfile(userProfile);
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      setError(null);
      setLoading(true);
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setError(getErrorMessage(err.code));
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    try {
      setError(null);
      setLoading(true);
      const result = await createUserWithEmailAndPassword(auth, email, password);

      // Update display name
      await updateProfile(result.user, { displayName });

      // Create user profile
      await userService.create(result.user.uid, {
        email,
        displayName,
      });
    } catch (err: any) {
      setError(getErrorMessage(err.code));
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    try {
      setError(null);
      setLoading(true);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setError(getErrorMessage(err.code));
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      setError(null);
      await signOut(auth);
    } catch (err: any) {
      setError(getErrorMessage(err.code));
      throw err;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      setError(null);
      await sendPasswordResetEmail(auth, email);
    } catch (err: any) {
      setError(getErrorMessage(err.code));
      throw err;
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        error,
        signIn,
        signUp,
        signInWithGoogle,
        logout,
        resetPassword,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Helper function to get user-friendly error messages
function getErrorMessage(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'This email is already registered. Please sign in instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled. Please contact support.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.';
    case 'auth/user-not-found':
      return 'No account found with this email. Please sign up.';
    case 'auth/wrong-password':
      return 'Incorrect password. Please try again.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in was cancelled. Please try again.';
    default:
      return 'An error occurred. Please try again.';
  }
}

export default AuthContext;
