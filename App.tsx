
import React, { useState, useEffect } from 'react';
import {
  Zap,
  ExternalLink,
  LayoutGrid,
  HelpCircle,
  X,
  Database,
  Smartphone,
  ShieldAlert,
  LogOut
} from 'lucide-react';
import { LinksList } from './components/LinksList';
import { CreateLink } from './components/CreateLink';
import { LoginPage, checkAuth, logout } from './components/LoginPage';
import { getLinks, saveLink, deleteLink, recordClick, clearAllLinks } from './services/storageService';
import { ShortLink } from './types';

type AppView = 'create' | 'list';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(checkAuth);
  const [view, setView] = useState<AppView>('create');
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Redirection State
  const [redirectState, setRedirectState] = useState<{active: boolean; url?: string}>({ active: false });

  // Initialize data and check for redirection hash
  useEffect(() => {
    // 1. Check for hash routing (e.g. /#/alias)
    const hash = window.location.hash;
    if (hash.startsWith('#/') && hash.length > 2) {
      const alias = hash.substring(2);
      const storedLinks = getLinks();
      const targetLink = storedLinks.find(l => l.alias === alias);

      if (targetLink) {
        setRedirectState({ active: true, url: targetLink.originalUrl });
        
        // Record the click
        recordClick(targetLink.id);
        
        // Redirect after a short delay to show feedback
        setTimeout(() => {
          window.location.replace(targetLink.originalUrl);
        }, 1500);
        return; // Stop execution here to show redirect screen
      }
    }

    // 2. Normal App Load
    setLinks(getLinks());
  }, [refreshTrigger]);

  const handleCreateLink = (newLink: ShortLink) => {
    saveLink(newLink);
    setRefreshTrigger(prev => prev + 1);
  };

  const handleDeleteLink = (id: string) => {
    if (window.confirm('Are you sure you want to delete this link?')) {
      deleteLink(id);
      setRefreshTrigger(prev => prev + 1);
    }
  };
  
  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear ALL links? This cannot be undone.')) {
      clearAllLinks();
      setRefreshTrigger(prev => prev + 1);
    }
  };

  const handleSimulateClick = (id: string) => {
    recordClick(id);
    setRefreshTrigger(prev => prev + 1);
  };

  // Login Screen
  if (!isAuthenticated) {
    return <LoginPage onLogin={() => setIsAuthenticated(true)} />;
  }

  // Redirection Screen
  if (redirectState.active) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-md w-full text-center space-y-6 animate-fade-in">
          <div className="relative w-20 h-20 mx-auto">
             <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
             <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
             <div className="absolute inset-0 flex items-center justify-center">
               <ExternalLink className="w-8 h-8 text-indigo-600" />
             </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Redirecting...</h2>
            <p className="text-gray-500 text-sm">
              Taking you to <br/>
              <span className="font-medium text-indigo-600 break-all">{redirectState.url}</span>
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
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div 
            className="flex items-center space-x-2 cursor-pointer group" 
            onClick={() => setView('create')}
          >
            <div className="bg-white p-2 rounded-xl shadow-sm border border-gray-100 group-hover:scale-110 transition-transform">
              <Zap className="w-5 h-5 text-indigo-600 fill-indigo-600" />
            </div>
            <span className="text-xl font-bold text-gray-800">
              LinkSmart
            </span>
          </div>

          <div className="flex items-center space-x-3">
             <button
               onClick={() => setShowInfoModal(true)}
               className="p-2.5 text-gray-500 hover:bg-white hover:text-indigo-600 rounded-full transition-colors"
               title="How it works"
             >
               <HelpCircle className="w-5 h-5" />
             </button>

             <button
               onClick={() => setView(view === 'create' ? 'list' : 'create')}
               className="flex items-center px-4 py-2 bg-white rounded-full border border-gray-200 shadow-sm text-sm font-medium text-gray-600 hover:text-indigo-600 hover:border-indigo-200 transition-all"
             >
               {view === 'create' ? (
                 <>
                   <LayoutGrid className="w-4 h-4 mr-2" />
                   My Links
                 </>
               ) : (
                 <>
                   <Zap className="w-4 h-4 mr-2" />
                   Create New
                 </>
               )}
             </button>

             <button
               onClick={() => { logout(); setIsAuthenticated(false); }}
               className="p-2.5 text-gray-500 hover:bg-white hover:text-red-500 rounded-full transition-colors"
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
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-bold text-gray-900 flex items-center">
                <ShieldAlert className="w-5 h-5 text-indigo-600 mr-2" />
                How this App Works
              </h3>
              <button onClick={() => setShowInfoModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex items-start space-x-4">
                <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900">Local Storage Only</h4>
                  <p className="text-sm text-gray-500 mt-1">
                    This app does not use a backend server. All your links are stored directly in your browser's <strong>Local Storage</strong>.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900">Device Specific</h4>
                  <p className="text-sm text-gray-500 mt-1">
                    Links created here <strong>will ONLY work on this device</strong>. If you send a link to a friend, it will not work for them because their browser doesn't have your local data.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="p-3 bg-red-50 rounded-xl text-red-600">
                  <Zap className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900">Clearing Data</h4>
                  <p className="text-sm text-gray-500 mt-1">
                    If you clear your browser cache or history, all your created links and statistics will be permanently deleted.
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6 bg-gray-50 text-center">
              <button 
                onClick={() => setShowInfoModal(false)}
                className="w-full py-3 bg-gray-900 hover:bg-black text-white rounded-xl font-bold transition-colors"
              >
                I Understand
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 pt-32 pb-12">
        {view === 'create' ? (
          <div className="animate-fade-in">
            <CreateLink onSave={handleCreateLink} onCancel={() => {}} />
            
            {/* Recent Links Preview */}
            {links.length > 0 && (
               <div className="mt-16 text-center">
                 <p className="text-gray-400 text-sm mb-2">Previously created</p>
                 <div className="flex flex-wrap justify-center gap-3">
                   {links.slice(0, 3).map(l => (
                     <button 
                       key={l.id}
                       onClick={() => setView('list')}
                       className="px-4 py-2 bg-white rounded-lg border border-gray-200 text-xs font-medium text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                     >
                       /{l.alias}
                     </button>
                   ))}
                 </div>
               </div>
            )}
          </div>
        ) : (
          <div className="animate-fade-in space-y-8">
             <div className="text-center">
               <h2 className="text-3xl font-bold text-gray-900">Your Links</h2>
               <p className="text-gray-500 mt-2">Manage and track your shortened URLs</p>
             </div>
             <LinksList 
               links={links} 
               onDelete={handleDeleteLink} 
               onSimulateClick={handleSimulateClick}
               onClearAll={handleClearAll}
             />
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
