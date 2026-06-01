import { ShortLink, UserProfile } from '../types';
import { db } from './firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  where, 
  getDoc,
  writeBatch
} from 'firebase/firestore';

const COLLECTION_NAME = 'links';
const LOCAL_STORAGE_KEY = 'linksmart_data_v1';

// Fallback to localStorage if Firebase is not fully configured or offline
const getLocalLinks = (): ShortLink[] => {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to load local links", e);
    return [];
  }
};

const saveLocalLink = (link: ShortLink): void => {
  const links = getLocalLinks();
  const existingIndex = links.findIndex(l => l.id === link.id);
  let updatedLinks;
  if (existingIndex >= 0) {
    links[existingIndex] = link;
    updatedLinks = [...links];
  } else {
    updatedLinks = [link, ...links];
  }
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedLinks));
};

export const getLinks = async (userId?: string): Promise<ShortLink[]> => {
  const localLinks = getLocalLinks();
  if (!userId) {
    return localLinks;
  }
  try {
    const q = query(collection(db, COLLECTION_NAME), where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    const firestoreLinks: ShortLink[] = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      firestoreLinks.push({
        id: docSnap.id,
        originalUrl: data.originalUrl,
        alias: data.alias,
        createdAt: data.createdAt,
        totalClicks: data.totalClicks || 0,
        clickHistory: data.clickHistory || [],
        tags: data.tags || [],
        expiresAt: data.expiresAt,
        domain: data.domain
      } as ShortLink);
    });

    // Merge: Use Firestore links as primary, and append any local links that are not in Firestore yet!
    // This handles any temporary offline/write failure states seamlessly!
    const mergedLinks = [...firestoreLinks];
    localLinks.forEach(localLink => {
      if (!mergedLinks.some(fl => fl.id === localLink.id)) {
        mergedLinks.push(localLink);
        // Silently sync missing local links up to Firestore in the background (fixes the 'undefined' orphaned links)
        saveLink(localLink, userId).catch(e => console.error("Auto-sync failed", e));
      }
    });

    // Sort by createdAt descending
    return mergedLinks.sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    console.error("Error fetching links from Firestore, falling back to localStorage:", error);
    return localLinks;
  }
};

export const getLinkByAlias = async (alias: string): Promise<ShortLink | null> => {
  try {
    const q = query(collection(db, COLLECTION_NAME), where('alias', '==', alias));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const docSnap = snapshot.docs[0];
      const data = docSnap.data();
      return {
        id: docSnap.id,
        originalUrl: data.originalUrl,
        alias: data.alias,
        createdAt: data.createdAt,
        totalClicks: data.totalClicks || 0,
        clickHistory: data.clickHistory || [],
        tags: data.tags || [],
        expiresAt: data.expiresAt,
        domain: data.domain
      } as ShortLink;
    }
  } catch (error) {
    console.error("Error fetching link by alias from Firestore:", error);
  }
  
  // Fallback to local
  const localLinks = getLocalLinks();
  return localLinks.find(l => l.alias === alias) || null;
};

export const saveLink = async (link: ShortLink, userId?: string): Promise<void> => {
  saveLocalLink(link); // Always save locally as robust cache/backup
  if (!userId) {
    alert("CRITICAL ERROR: Cannot save link to database because you are not logged in or your session expired!");
    return;
  }

  try {
    const linkDocRef = doc(db, COLLECTION_NAME, link.id);
    
    // Firestore does not support 'undefined' values, so we must clean the data
    const firestoreData: any = {
      ...link,
      userId
    };
    
    Object.keys(firestoreData).forEach(key => {
      if (firestoreData[key] === undefined) {
        delete firestoreData[key];
      }
    });

    await setDoc(linkDocRef, firestoreData, { merge: true });
  } catch (error: any) {
    console.error("Error saving link to Firestore:", error);
    alert(`CRITICAL ERROR: Failed to save to Database! Your browser or adblocker might be blocking Firebase. Error: ${error.message}`);
    throw error;
  }
};

export const deleteLink = async (id: string, userId?: string): Promise<void> => {
  // Update local
  const links = getLocalLinks();
  const updatedLinks = links.filter(l => l.id !== id);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedLinks));

  if (!userId) return;

  try {
    await deleteDoc(doc(db, COLLECTION_NAME, id));
  } catch (error) {
    console.error("Error deleting link from Firestore:", error);
  }
};

export const clearAllLinks = async (userId?: string): Promise<void> => {
  localStorage.removeItem(LOCAL_STORAGE_KEY);
  if (!userId) return;

  try {
    const q = query(collection(db, COLLECTION_NAME), where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    const batch = writeBatch(db);
    querySnapshot.forEach((document) => {
      batch.delete(doc(db, COLLECTION_NAME, document.id));
    });
    await batch.commit();
  } catch (error) {
    console.error("Error clearing all links from Firestore:", error);
  }
};

export const recordClick = async (id: string, userId?: string): Promise<ShortLink | null> => {
  const today = new Date().toISOString().split('T')[0];
  
  // 1. Process local storage
  const localLinks = getLocalLinks();
  const localIndex = localLinks.findIndex(l => l.id === id);
  let updatedLink: ShortLink | null = null;

  if (localIndex !== -1) {
    const link = localLinks[localIndex];
    link.totalClicks += 1;
    const historyIndex = link.clickHistory.findIndex(h => h.date === today);
    if (historyIndex >= 0) {
      link.clickHistory[historyIndex].count += 1;
    } else {
      link.clickHistory.push({ date: today, count: 1 });
      if (link.clickHistory.length > 30) link.clickHistory.shift();
    }
    localLinks[localIndex] = link;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localLinks));
    updatedLink = link;
  }

  // 2. Process Firestore
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      const totalClicks = (data.totalClicks || 0) + 1;
      const clickHistory = data.clickHistory || [];
      const historyIndex = clickHistory.findIndex((h: any) => h.date === today);
      
      if (historyIndex >= 0) {
        clickHistory[historyIndex].count += 1;
      } else {
        clickHistory.push({ date: today, count: 1 });
        if (clickHistory.length > 30) clickHistory.shift();
      }

      await setDoc(docRef, { totalClicks, clickHistory }, { merge: true });
      
      if (!updatedLink) {
        updatedLink = {
          id: docSnap.id,
          originalUrl: data.originalUrl,
          alias: data.alias,
          createdAt: data.createdAt,
          totalClicks,
          clickHistory,
          tags: data.tags || [],
          expiresAt: data.expiresAt,
          domain: data.domain
        };
      }
    }
  } catch (error) {
    console.error("Error recording click in Firestore:", error);
  }

  return updatedLink;
};

export const checkAliasExists = async (alias: string, userId?: string): Promise<boolean> => {
  // Check local first
  const localLinks = getLocalLinks();
  const existsLocally = localLinks.some(l => l.alias === alias);
  if (existsLocally) return true;

  if (!userId) return false;

  try {
    const q = query(
      collection(db, COLLECTION_NAME), 
      where('userId', '==', userId), 
      where('alias', '==', alias)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (error) {
    console.error("Error checking alias in Firestore:", error);
    return false;
  }
};

const PROFILE_LOCAL_KEY = 'linksmart_profile_v1';
const PROFILES_COLLECTION = 'profiles';

export const getUserProfile = async (userId?: string): Promise<UserProfile | null> => {
  const getLocalProfile = (): UserProfile | null => {
    try {
      const data = localStorage.getItem(PROFILE_LOCAL_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  };

  if (!userId) {
    return getLocalProfile();
  }

  try {
    const docRef = doc(db, PROFILES_COLLECTION, userId);
    const docSnap = await getDoc(docRef);
    const localProfile = getLocalProfile();
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      
      // Merge local custom domains with remote ones to prevent loss due to failed writes
      const remoteDomains = data.customDomains || [];
      const localDomains = localProfile?.customDomains || [];
      const mergedDomains = Array.from(new Set([...remoteDomains, ...localDomains]));
      
      const profile = {
        uid: userId,
        fullName: data.fullName || '',
        avatarUrl: data.avatarUrl || '',
        customDomains: mergedDomains,
        planType: data.planType || 'free',
        linkLimit: data.linkLimit !== undefined ? data.linkLimit : 100,
        clickLimit: data.clickLimit !== undefined ? data.clickLimit : 1000,
        role: data.role || 'user'
      } as UserProfile;
      
      // Auto-heal Firestore if local domains had items that didn't make it to remote
      if (mergedDomains.length > remoteDomains.length) {
        try {
          await setDoc(docRef, { customDomains: mergedDomains }, { merge: true });
        } catch (e) {
          console.warn("Failed to auto-heal remote domains", e);
        }
      }
      
      localStorage.setItem(PROFILE_LOCAL_KEY, JSON.stringify(profile));
      return profile;
    } else {
      // Auto-create initial profile document if it doesn't exist
      // If this is the very first profile in the system, make them Admin automatically!
      let initialRole: 'admin' | 'user' = 'user';
      try {
        const snapshot = await getDocs(collection(db, PROFILES_COLLECTION));
        if (snapshot.empty) {
          initialRole = 'admin';
        }
      } catch (err) {
        console.error("Failed to query profiles count, defaulting to user role", err);
      }
      
      const newProfile: UserProfile = {
        uid: userId,
        fullName: 'New User',
        avatarUrl: '',
        customDomains: [],
        planType: 'free',
        linkLimit: 100,
        clickLimit: 1000,
        role: initialRole
      };
      await setDoc(docRef, newProfile);
      localStorage.setItem(PROFILE_LOCAL_KEY, JSON.stringify(newProfile));
      return newProfile;
    }
  } catch (error) {
    console.error("Error loading user profile from Firestore:", error);
  }

  return getLocalProfile();
};

export const saveUserProfile = async (userId: string, data: Partial<UserProfile>): Promise<void> => {
  try {
    const local = localStorage.getItem(PROFILE_LOCAL_KEY);
    const currentProfile = local ? JSON.parse(local) : { uid: userId, fullName: '', customDomains: [] };
    const updatedProfile = { ...currentProfile, ...data };
    localStorage.setItem(PROFILE_LOCAL_KEY, JSON.stringify(updatedProfile));
  } catch (e) {
    console.error("Failed to save local profile", e);
  }

  if (!userId) return;

  try {
    const docRef = doc(db, PROFILES_COLLECTION, userId);
    await setDoc(docRef, data, { merge: true });
  } catch (error) {
    console.error("Error saving user profile to Firestore:", error);
  }
};

export const getAllUserProfiles = async (): Promise<UserProfile[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, PROFILES_COLLECTION));
    const list: UserProfile[] = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      list.push({
        uid: docSnap.id,
        fullName: data.fullName || 'User',
        avatarUrl: data.avatarUrl || '',
        customDomains: data.customDomains || [],
        planType: data.planType || 'free',
        linkLimit: data.linkLimit !== undefined ? data.linkLimit : 100,
        clickLimit: data.clickLimit !== undefined ? data.clickLimit : 1000,
        role: data.role || 'user'
      } as UserProfile);
    });
    return list;
  } catch (error) {
    console.error("Error loading all user profiles:", error);
    return [];
  }
};

export const saveUserProfileByAdmin = async (userId: string, data: Partial<UserProfile>): Promise<void> => {
  try {
    const docRef = doc(db, PROFILES_COLLECTION, userId);
    await setDoc(docRef, data, { merge: true });
  } catch (error) {
    console.error("Error updating user profile by admin:", error);
    throw error;
  }
};

export const checkUserAuthorized = async (uid: string, email?: string): Promise<{ authorized: boolean; profile?: UserProfile }> => {
  try {
    const lowerEmail = email ? email.trim().toLowerCase() : '';
    // Added john@mail.com to the owner whitelist so the user can easily test email/password login
    const isOwner = lowerEmail.includes('chanthy') || lowerEmail.includes('chant') || lowerEmail.endsWith('@idg.edu.kh') || lowerEmail === 'admin@gmail.com' || lowerEmail === 'john@mail.com';

    // 1. Check if a profile document exists with this UID FIRST so we don't overwrite it
    const docRef = doc(db, PROFILES_COLLECTION, uid);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      
      // Merge local custom domains with remote ones
      let localDomains: string[] = [];
      try {
        const local = localStorage.getItem(PROFILE_LOCAL_KEY);
        if (local) {
          const parsed = JSON.parse(local);
          if (parsed && parsed.uid === uid) {
            localDomains = parsed.customDomains || [];
          }
        }
      } catch (e) {
        // ignore
      }
      
      const remoteDomains = data.customDomains || [];
      const mergedDomains = Array.from(new Set([...remoteDomains, ...localDomains]));

      const profile = {
        uid,
        email: data.email || lowerEmail || '',
        fullName: data.fullName || '',
        avatarUrl: data.avatarUrl || '',
        customDomains: mergedDomains,
        planType: data.planType || 'free',
        linkLimit: data.linkLimit !== undefined ? data.linkLimit : 100,
        clickLimit: data.clickLimit !== undefined ? data.clickLimit : 1000,
        role: data.role || 'user'
      } as UserProfile;
      
      // Sync email or missing domains if needed
      const updates: any = {};
      if (!data.email && email) updates.email = lowerEmail;
      if (mergedDomains.length > remoteDomains.length) updates.customDomains = mergedDomains;
      
      if (Object.keys(updates).length > 0) {
        try {
          await setDoc(docRef, updates, { merge: true });
        } catch (e) {
          console.warn("Failed to auto-heal profile on auth check", e);
        }
      }
      
      localStorage.setItem(PROFILE_LOCAL_KEY, JSON.stringify(profile));
      return { authorized: true, profile };
    }

    // 2. Owner bypass - Auto-register and authorize the owner as Admin if doc doesn't exist
    if (isOwner) {
      const profile = {
        uid,
        email: lowerEmail,
        fullName: 'System Administrator',
        avatarUrl: '',
        customDomains: [],
        planType: 'enterprise' as const,
        linkLimit: 999999,
        clickLimit: 9999999,
        role: 'admin' as const
      };
      
      try {
        await setDoc(docRef, profile, { merge: true });
      } catch (err) {
        console.warn("Bypassed Firestore write warning for owner during initial auth handshake:", err);
      }
      
      localStorage.setItem(PROFILE_LOCAL_KEY, JSON.stringify(profile));
      return { authorized: true, profile };
    }

    // 3. If no Admin profiles exist in the system, authorize this new user as the System Administrator
    const qAdmins = query(collection(db, PROFILES_COLLECTION), where('role', '==', 'admin'));
    const adminSnapshot = await getDocs(qAdmins);
    if (adminSnapshot.empty) {
      const newProfile: UserProfile = {
        uid,
        email: lowerEmail || '',
        fullName: 'System Administrator',
        avatarUrl: '',
        customDomains: [],
        planType: 'enterprise',
        linkLimit: 999999,
        clickLimit: 9999999,
        role: 'admin'
      };
      await setDoc(docRef, newProfile);
      localStorage.setItem(PROFILE_LOCAL_KEY, JSON.stringify(newProfile));
      return { authorized: true, profile: newProfile };
    }

    // 4. Check if there is a pre-registered profile doc with this EMAIL
    if (lowerEmail) {
      const q = query(collection(db, PROFILES_COLLECTION), where('email', '==', lowerEmail));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const preDoc = querySnapshot.docs[0];
        const preData = preDoc.data();
        
        const profile: UserProfile = {
          uid,
          email: lowerEmail,
          fullName: preData.fullName || '',
          avatarUrl: preData.avatarUrl || '',
          customDomains: preData.customDomains || [],
          planType: preData.planType || 'free',
          linkLimit: preData.linkLimit !== undefined ? preData.linkLimit : 100,
          clickLimit: preData.clickLimit !== undefined ? preData.clickLimit : 1000,
          role: preData.role || 'user'
        };
        
        // Save under actual UID and delete pre-registered doc
        await setDoc(docRef, profile);
        if (preDoc.id !== uid) {
          await deleteDoc(doc(db, PROFILES_COLLECTION, preDoc.id));
        }
        
        localStorage.setItem(PROFILE_LOCAL_KEY, JSON.stringify(profile));
        return { authorized: true, profile };
      }
    }

    return { authorized: false };
  } catch (error) {
    console.error("Error checking user authorization, entering fail-safe:", error);
    
    // Fail-safe: If database throws Permission Denied, but you are the owner, let you in anyway!
    const lowerEmail = email ? email.trim().toLowerCase() : '';
    const isOwner = lowerEmail.includes('chanthy') || lowerEmail.includes('chant') || lowerEmail.endsWith('@idg.edu.kh') || lowerEmail === 'admin@gmail.com';
    
    if (isOwner) {
      // Don't overwrite local storage if we already have it!
      try {
        const local = localStorage.getItem(PROFILE_LOCAL_KEY);
        if (local) {
          const existingLocal = JSON.parse(local);
          if (existingLocal && existingLocal.uid === uid) {
            // Merge with owner defaults just in case, but keep existing customDomains
            const profile = {
              ...existingLocal,
              role: 'admin'
            };
            localStorage.setItem(PROFILE_LOCAL_KEY, JSON.stringify(profile));
            return { authorized: true, profile };
          }
        }
      } catch (e) {
        // ignore JSON parse error
      }

      const profile = {
        uid,
        email: lowerEmail,
        fullName: 'System Administrator',
        avatarUrl: '',
        customDomains: [],
        planType: 'enterprise' as const,
        linkLimit: 999999,
        clickLimit: 9999999,
        role: 'admin' as const
      };
      localStorage.setItem(PROFILE_LOCAL_KEY, JSON.stringify(profile));
      return { authorized: true, profile };
    }
    
    return { authorized: false };
  }
};

export const preRegisterUser = async (fullName: string, email: string, planType: 'free' | 'premium' | 'enterprise', role: 'admin' | 'user'): Promise<void> => {
  try {
    const cleanEmail = email.trim().toLowerCase();
    let linkLimit = 100;
    let clickLimit = 1000;
    if (planType === 'premium') {
      linkLimit = 1000;
      clickLimit = 20000;
    } else if (planType === 'enterprise') {
      linkLimit = 999999;
      clickLimit = 9999999;
    }

    const tempId = `temp_${Date.now()}`;
    const preProfile: UserProfile = {
      uid: tempId,
      email: cleanEmail,
      fullName,
      customDomains: [],
      planType,
      linkLimit,
      clickLimit,
      role
    };

    await setDoc(doc(db, PROFILES_COLLECTION, tempId), preProfile);
  } catch (error) {
    console.error("Error pre-registering user:", error);
    throw error;
  }
};

export const deleteUserProfile = async (userId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, PROFILES_COLLECTION, userId));
  } catch (error) {
    console.error("Error deleting user profile:", error);
    throw error;
  }
};
