import React, { useState, useEffect } from 'react';
import {
  ExternalLink,
  LayoutGrid,
  HelpCircle,
  X,
  Database,
  Smartphone,
  ShieldAlert,
  LogOut,
  Zap,
  User
} from 'lucide-react';
import { LinksList } from './components/LinksList';
import { CreateLink } from './components/CreateLink';
import { LoginPage } from './components/LoginPage';
import { UserProfile } from './components/UserProfile';
import { getLinks, saveLink, deleteLink, recordClick, clearAllLinks, getUserProfile, saveUserProfile, checkUserAuthorized } from './services/storageService';
import { ShortLink, UserProfile as UserProfileType } from './types';
import { auth } from './services/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';

const App: React.FC = () => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  
  // Profile Settings States
  const [profile, setProfile] = useState<UserProfileType | null>(null);
  const [showProfile, setShowProfile] = useState<boolean>(false);

  // Redirection State
  const [redirectState, setRedirectState] = useState<{active: boolean; url?: string; expired?: boolean}>({ active: false });

  // 1. Listen to Authentication State and enforce pre-registration checking!
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setAuthLoading(true);
        setAuthError(null);
        const { authorized, profile: loadedProfile } = await checkUserAuthorized(currentUser.uid, currentUser.email || undefined);
        
        if (authorized && loadedProfile) {
          setUser(currentUser);
          setProfile(loadedProfile);
          setIsAuthenticated(true);
        } else {
          // Un-authorized user!
          setAuthError(`We are sorry, but your email "${currentUser.email || 'null'}" (UID: ${currentUser.uid}) is not pre-registered in our system. Please contact the administrator to gain access.`);
          setUser(null);
          setProfile(null);
          setIsAuthenticated(false);
          await signOut(auth);
        }
        setAuthLoading(false);
      } else {
        setUser(null);
        setProfile(null);
        setIsAuthenticated(false);
        setAuthLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Initialize data and check for redirection hash
  useEffect(() => {
    if (authLoading) return;

    const checkRedirection = async () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/') && hash.length > 2) {
        const alias = hash.substring(2);
        
        // Fetch current links list to resolve redirection
        const storedLinks = await getLinks(user?.uid);
        const targetLink = storedLinks.find(l => l.alias === alias);

        if (targetLink) {
          // Check expiration
          if (targetLink.expiresAt && Date.now() > targetLink.expiresAt) {
            setRedirectState({ active: true, expired: true, url: targetLink.originalUrl });
            return true;
          }

          setRedirectState({ active: true, url: targetLink.originalUrl });
          
          // Record the click
          await recordClick(targetLink.id, user?.uid);
          
          // Redirect after a short delay to show feedback
          setTimeout(() => {
            window.location.replace(targetLink.originalUrl);
          }, 1500);
          return true;
        }
      }
      return false;
    };

    const loadData = async () => {
      const isRedirecting = await checkRedirection();
      if (!isRedirecting) {
        const fetchedLinks = await getLinks(user?.uid);
        setLinks(fetchedLinks);

        if (user?.uid) {
          const userProf = await getUserProfile(user.uid);
          setProfile(userProf);
        }
      }
    };

    loadData();
  }, [refreshTrigger, authLoading, user]);

  const handleCreateLink = async (newLink: ShortLink) => {
    await saveLink(newLink, user?.uid);
    setRefreshTrigger(prev => prev + 1);
  };

  const handleUpdateLink = async (updatedLink: ShortLink) => {
    await saveLink(updatedLink, user?.uid);
    setRefreshTrigger(prev => prev + 1);
  };

  const handleDeleteLink = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this link?')) {
      await deleteLink(id, user?.uid);
      setRefreshTrigger(prev => prev + 1);
    }
  };
  
  const handleClearAll = async () => {
    if (window.confirm('Are you sure you want to clear ALL links? This cannot be undone.')) {
      await clearAllLinks(user?.uid);
      setRefreshTrigger(prev => prev + 1);
    }
  };

  const handleSimulateClick = async (id: string) => {
    await recordClick(id, user?.uid);
    setRefreshTrigger(prev => prev + 1);
  };

  const handleSaveProfile = async (updatedData: Partial<UserProfileType>) => {
    if (user?.uid) {
      await saveUserProfile(user.uid, updatedData);
      setRefreshTrigger(prev => prev + 1);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Sign out failed", err);
    }
  };

  // Auth Loading State
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Login Screen
  if (!isAuthenticated) {
    return (
      <div className="relative">
        {authError && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 max-w-md w-full px-4 animate-fade-in">
            <div className="bg-red-50 border-2 border-brand-red/35 p-4 text-xs text-brand-red font-bold rounded-none shadow-xl flex items-center justify-between gap-3">
              <span>{authError}</span>
              <button 
                onClick={() => setAuthError(null)} 
                className="text-brand-red/70 hover:text-brand-red font-black text-[10px] uppercase select-none transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        <LoginPage onLogin={() => setIsAuthenticated(true)} />
      </div>
    );
  }

  // Redirection Screen
  if (redirectState.active) {
    if (redirectState.expired) {
      return (
        <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4">
          <div className="bg-white p-8 rounded-none shadow-sm border border-gray-150 max-w-md w-full text-center space-y-6 animate-fade-in">
            <div className="w-16 h-16 bg-brand-red/10 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-8 h-8 text-brand-red" />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-brand-navy tracking-tight mb-2">Link Expired</h2>
              <p className="text-gray-500 text-sm leading-relaxed">
                This shortened link has passed its scheduled expiration date and is no longer active.
              </p>
            </div>
            <div className="pt-2">
              <button 
                onClick={() => window.location.replace('/')}
                className="w-full py-2.5 bg-brand-navy text-white text-sm font-bold rounded-none hover:opacity-95"
              >
                Go to Homepage
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-none shadow-sm border border-gray-150 max-w-md w-full text-center space-y-6 animate-fade-in">
          <div className="relative w-20 h-20 mx-auto">
             <div className="absolute inset-0 border-4 border-brand-primary/20 rounded-full"></div>
             <div className="absolute inset-0 border-4 border-brand-primary rounded-full border-t-transparent animate-spin"></div>
             <div className="absolute inset-0 flex items-center justify-center">
               <ExternalLink className="w-8 h-8 text-brand-primary" />
             </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Redirecting...</h2>
            <p className="text-gray-500 text-sm">
              Taking you to <br/>
              <span className="font-medium text-brand-primary break-all">{redirectState.url}</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Main App Interface
  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-gray-900">
      
      {/* Minimal Header */}
      <header className="absolute top-0 left-0 right-0 z-30 p-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div 
            className="flex flex-col items-center space-y-1 cursor-pointer group" 
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <img 
              src="/logo.png" 
              alt="Logo" 
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const parent = e.currentTarget.parentElement;
                if (parent && !parent.querySelector('.logo-fallback')) {
                  const fallback = document.createElement('div');
                  fallback.className = "logo-fallback w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-xs select-none shadow-sm";
                  fallback.innerText = "IDG";
                  parent.appendChild(fallback);
                }
              }}
              className="max-h-20 max-w-[220px] object-contain"
            />
          </div>

          <div className="flex items-center space-x-3">
             <button
               onClick={() => setShowInfoModal(true)}
               className="p-2.5 text-gray-500 hover:bg-white hover:text-brand-primary rounded-none transition-colors"
               title="How it works"
             >
               <HelpCircle className="w-5 h-5" />
             </button>

             <button
               onClick={() => { setShowProfile(!showProfile); }}
               className={`w-9 h-9 rounded-none border transition-all overflow-hidden flex-shrink-0 flex items-center justify-center bg-gray-50 ${
                 showProfile ? 'border-brand-primary scale-105 shadow-sm' : 'border-gray-200 hover:border-brand-primary'
               }`}
             >
                {(profile?.avatarUrl || auth.currentUser?.photoURL) ? (
                  <img 
                    src={profile?.avatarUrl || auth.currentUser?.photoURL || ''} 
                    alt="Avatar" 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  <User className="w-5 h-5 text-gray-500" />
                )}
             </button>

             <button
               onClick={handleLogout}
               className="p-2.5 text-gray-500 hover:bg-white hover:text-red-500 rounded-none transition-colors"
               title="Sign out"
             >
               <LogOut className="w-5 h-5" />
             </button>
          </div>
        </div>
      </header>

      {/* Info Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
              <h3 className="text-lg font-bold text-gray-900 flex items-center">
                <ShieldAlert className="w-5 h-5 text-brand-primary mr-2" />
                How this App Works
              </h3>
              <button onClick={() => setShowInfoModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-6 flex-1 overflow-y-auto">
              <div className="flex items-start space-x-4">
                <div className="p-3 bg-brand-primary/10 rounded-xl text-brand-primary">
                  <Zap className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900">Custom Branded Domain & Name</h4>
                  <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                    To shorten a URL with a custom name on the platform, simply copy and paste the long link in the space provided, pick a connected custom domain from the dropdown, enter in a unique link alias (ex. “example” for “shorturl.idg.edu.kh/example”) and click 'Shorten URL'.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900">Cloud Persistent Database</h4>
                  <p className="text-sm text-gray-500 mt-1">
                    This app stores all shortened links securely in a **Google Cloud Firestore** database, meaning your data is saved forever and is available on any device!
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900">Cross-Device Compatible</h4>
                  <p className="text-sm text-gray-500 mt-1">
                    Your shortened links **will work on any device** for anyone! Simply share the link and watch your real-time analytics update instantly.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="p-3 bg-red-50 rounded-xl text-red-600">
                  <Zap className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900">Secure Authentication</h4>
                  <p className="text-sm text-gray-500 mt-1">
                    Your links are private and safely synced with your individual user account. Sign in anywhere to view your dashboard!
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6 bg-gray-50 text-center shrink-0 border-t border-gray-100">
              <button 
                onClick={() => setShowInfoModal(false)}
                className="w-full py-3 bg-gray-900 hover:bg-black text-white rounded-none font-bold transition-colors"
              >
                Let's Build!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className={`mx-auto px-4 pt-32 pb-12 transition-all duration-300 ${showProfile ? 'max-w-7xl' : 'max-w-4xl'}`}>
        {showProfile ? (
          <UserProfile 
            userId={user?.uid || ''} 
            userEmail={user?.email || ''} 
            links={links} 
            profile={profile}
            onSaveProfile={handleSaveProfile}
            onClose={() => setShowProfile(false)}
          />
        ) : (
          <div className="space-y-16">
            <div className="animate-fade-in">
              <CreateLink 
                onSave={handleCreateLink} 
                onCancel={() => {}} 
                userId={user?.uid} 
                customDomains={profile?.customDomains || []}
              />
            </div>
            
            <div className="animate-fade-in space-y-8 border-t border-gray-150 pt-16">
               <div className="text-center">
                 <h2 className="text-3xl font-extrabold text-brand-navy tracking-tight uppercase">
                   Your Links <span className="text-brand-primary">({links.length})</span>
                 </h2>
                 <p className="text-gray-500 mt-2">Search, filter, and track your shortened URLs with real-time analytics</p>
               </div>
               <LinksList 
                 links={links} 
                 onDelete={handleDeleteLink} 
                 onSimulateClick={handleSimulateClick}
                 onUpdateLink={handleUpdateLink}
               />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
