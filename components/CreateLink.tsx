import React, { useState, useEffect } from 'react';
import { ArrowRight, Check, Copy, QrCode, RotateCcw, Save, Edit2, Globe, Link2 } from 'lucide-react';
import { ShortLink } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { checkAliasExists } from '../services/storageService';

interface CreateLinkProps {
  userId?: string;
  onSave: (link: ShortLink) => void;
  onCancel: () => void;
  customDomains?: string[];
}

export const CreateLink: React.FC<CreateLinkProps> = ({ onSave, userId, customDomains = [] }) => {
  const [mode, setMode] = useState<'input' | 'success'>('input');
  const [activeTab, setActiveTab] = useState<'short' | 'qr'>('short');
  const [url, setUrl] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [currentLink, setCurrentLink] = useState<ShortLink | null>(null);
  
  // Custom Branding States
  const [selectedDomain, setSelectedDomain] = useState('');
  const [customAlias, setCustomAlias] = useState('');
  
  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editAlias, setEditAlias] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // UI State
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [host, setHost] = useState('');
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setHost(window.location.host);
    setOrigin(window.location.origin);
    if (customDomains && customDomains.length > 0) {
      setSelectedDomain(customDomains[0]);
    } else {
      setSelectedDomain(window.location.host);
    }
  }, [customDomains]);

  const generateRandomAlias = () => {
    return Math.random().toString(36).substring(2, 8); // generates 6 random alphanumeric chars
  };

  const handleShorten = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setError(null);

    let alias = customAlias.trim().toLowerCase().replace(/[^a-zA-Z0-9-_]/g, '');

    if (alias) {
      const exists = await checkAliasExists(alias, userId);
      if (exists) {
        setError('This custom alias is already taken.');
        return;
      }
      if (alias.length < 3) {
        setError('Custom alias must be at least 3 characters.');
        return;
      }
    } else {
      // 1. Auto-create logic
      alias = generateRandomAlias();
      // Ensure uniqueness (simple retry)
      let exists = await checkAliasExists(alias, userId);
      let attempts = 0;
      while (exists && attempts < 10) {
        alias = generateRandomAlias();
        exists = await checkAliasExists(alias, userId);
        attempts++;
      }
    }

    const expiresAt = expiryDate ? new Date(expiryDate).getTime() : undefined;

    const newLink: ShortLink = {
      id: uuidv4(),
      originalUrl: url,
      alias: alias,
      createdAt: Date.now(),
      totalClicks: 0,
      clickHistory: [],
      tags: ['auto'],
      expiresAt: expiresAt,
      domain: selectedDomain
    };

    // 2. Save and switch view
    onSave(newLink);
    setCurrentLink(newLink);
    setEditAlias(alias);
    setMode('success');
    setError(null);
    setShowQr(activeTab === 'qr');
  };

  const handleUpdateAlias = async () => {
    if (!currentLink) return;
    const cleanAlias = editAlias.trim().replace(/\s+/g, '-');
    
    if (cleanAlias === currentLink.alias) {
      setIsEditing(false);
      return;
    }
    
    const exists = await checkAliasExists(cleanAlias, userId);
    if (exists) {
      setError('This alias is already taken.');
      return;
    }

    if (cleanAlias.length < 3) {
      setError('Alias is too short.');
      return;
    }

    const updatedLink = { ...currentLink, alias: cleanAlias };
    onSave(updatedLink);
    setCurrentLink(updatedLink);
    setIsEditing(false);
    setError(null);
  };

  const handleCopy = () => {
    if (!currentLink) return;
    const isCustom = selectedDomain !== host;
    const targetOrigin = isCustom ? `https://${selectedDomain}` : origin;
    const fullUrl = isCustom 
      ? `${targetOrigin}/${currentLink.alias}` 
      : `${targetOrigin}/#/${currentLink.alias}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setUrl('');
    setExpiryDate('');
    setCustomAlias('');
    setSelectedDomain(customDomains.length > 0 ? customDomains[0] : host);
    setMode('input');
    setCurrentLink(null);
    setIsEditing(false);
    setShowQr(false);
  };

  // --- RENDER: INPUT MODE ---
  if (mode === 'input') {
    return (
      <div className="bg-white rounded-none shadow-xl shadow-brand-primary/10 border border-brand-primary/20 p-8 md:p-12 text-center w-full mx-auto transition-all">
        {/* Tabs */}
        <div className="flex border-b border-gray-150 mb-8">
          <button
            type="button"
            onClick={() => setActiveTab('short')}
            className={`flex-1 py-4 text-sm font-bold uppercase tracking-wider border-b-2 transition-all flex items-center justify-center gap-2 rounded-none ${
              activeTab === 'short'
                ? 'border-brand-primary text-brand-primary bg-brand-primary/5'
                : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Link2 className="w-4 h-4" />
            Shorten URL
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('qr')}
            className={`flex-1 py-4 text-sm font-bold uppercase tracking-wider border-b-2 transition-all flex items-center justify-center gap-2 rounded-none ${
              activeTab === 'qr'
                ? 'border-brand-primary text-brand-primary bg-brand-primary/5'
                : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
          >
            <QrCode className="w-4 h-4" />
            Generate QR Code
          </button>
        </div>

        <div className="mb-8 animate-fade-in">
          <div className="w-16 h-16 bg-brand-primary/10 rounded-none flex items-center justify-center mx-auto mb-6">
            {activeTab === 'short' ? (
              <Link2 className="w-8 h-8 text-brand-primary" />
            ) : (
              <QrCode className="w-8 h-8 text-brand-primary" />
            )}
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-3">
            {activeTab === 'short' ? 'Paste your long link' : 'Generate branded QR Code'}
          </h2>
          <p className="text-gray-500">
            {activeTab === 'short' 
              ? "We'll generate a short, trackable link for you instantly."
              : 'Enter a long link to generate a trackable QR Code and short URL.'}
          </p>
        </div>

        <form onSubmit={handleShorten} className="relative text-left space-y-4">
          <div className="relative flex items-center">
            <Globe className="absolute left-4 text-gray-400 w-5 h-5" />
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/very-long-url..."
              className="w-full pl-12 pr-4 py-5 rounded-none border-2 border-gray-100 bg-gray-50 focus:bg-white focus:border-brand-primary focus:ring-0 text-lg transition-all placeholder:text-gray-400"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Domain Dropdown */}
            <div className="bg-gray-50 border border-gray-100 p-4">
              <label className="block text-xs font-black text-brand-navy uppercase tracking-wider mb-2">
                Branded Domain
              </label>
              <select
                value={selectedDomain}
                onChange={(e) => setSelectedDomain(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-gray-200 text-sm text-brand-navy font-bold focus:outline-none focus:border-brand-primary rounded-none transition-colors select-none cursor-pointer"
              >
                {customDomains.length === 0 ? (
                  <option value={host}>Default Host ({host})</option>
                ) : (
                  customDomains.map(dom => (
                    <option key={dom} value={dom}>{dom}</option>
                  ))
                )}
              </select>
            </div>

            {/* Custom Alias Input */}
            <div className="bg-gray-50 border border-gray-100 p-4">
              <label className="block text-xs font-black text-brand-navy uppercase tracking-wider mb-2">
                Link Alias (Optional)
              </label>
              <input
                type="text"
                placeholder="ex. example"
                value={customAlias}
                onChange={(e) => setCustomAlias(e.target.value.replace(/[^a-zA-Z0-9-_]/g, ''))}
                className="w-full px-3.5 py-2.5 bg-white border border-gray-200 text-sm text-gray-900 font-bold focus:outline-none focus:border-brand-primary rounded-none transition-colors"
              />
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-100 p-4">
            <label className="block text-xs font-black text-brand-navy uppercase tracking-wider mb-2">
              Set Expiration Date (Optional)
            </label>
            <input 
              type="datetime-local"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-brand-primary rounded-none transition-colors"
            />
            <p className="text-[10px] text-gray-400 mt-1.5">
              Leave empty if you want this link to never expire.
            </p>
          </div>

          {error && (
            <div className="p-3.5 bg-brand-red/10 border border-brand-red/15 text-xs text-brand-red font-bold uppercase tracking-wider animate-fade-in">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-brand-primary hover:opacity-90 text-white font-bold py-4 rounded-none text-lg shadow-lg shadow-brand-primary/20 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center"
          >
            {activeTab === 'short' ? (
              <>
                Shorten URL <ArrowRight className="ml-2 w-5 h-5" />
              </>
            ) : (
              <>
                Generate QR Code & Link <QrCode className="ml-2 w-5 h-5" />
              </>
            )}
          </button>
        </form>
      </div>
    );
  }

  // --- RENDER: SUCCESS MODE ---
  return (
    <div className="bg-white rounded-none shadow-xl shadow-brand-primary/10 border border-brand-primary/20 p-8 md:p-10 w-full mx-auto animate-fade-in">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-none bg-green-100 text-green-600 mb-4">
          <Check className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">
          {activeTab === 'short' ? 'Link Created!' : 'QR Code Generated!'}
        </h2>
        <p className="text-gray-500 text-sm truncate max-w-md mx-auto mt-1">{currentLink?.originalUrl}</p>
      </div>

      {/* Link Card */}
      <div className="bg-gray-50 rounded-none p-2 border border-gray-200 mb-6">
        <div className="flex flex-col md:flex-row items-center gap-2">
          <div className="flex-1 w-full md:w-auto px-4 py-3 flex items-center">
            <span className="text-gray-400 font-medium mr-1 select-none">
              {selectedDomain === host ? `${host}/#/` : `${selectedDomain}/`}
            </span>
            
            {isEditing ? (
              <div className="flex-1 relative">
                <input 
                  autoFocus
                  type="text"
                  value={editAlias}
                  onChange={(e) => setEditAlias(e.target.value.replace(/[^a-zA-Z0-9-_]/g, ''))}
                  className="w-full bg-white border-b-2 border-brand-primary px-1 py-0.5 outline-none font-bold text-brand-primary rounded-none"
                />
              </div>
            ) : (
              <span className="font-bold text-gray-800 text-lg">{currentLink?.alias}</span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto pr-2">
            {isEditing ? (
              <button 
                onClick={handleUpdateAlias}
                className="flex-1 md:flex-none bg-brand-primary text-white px-4 py-2 rounded-none text-sm font-bold hover:opacity-90 transition-colors flex items-center justify-center"
              >
                <Save className="w-4 h-4 mr-1.5" /> Save
              </button>
            ) : (
              <>
                <button 
                  onClick={() => {
                    setEditAlias(currentLink?.alias || '');
                    setIsEditing(true);
                    setError(null);
                  }}
                  className="p-2.5 text-gray-500 hover:bg-white hover:text-brand-primary rounded-none transition-colors"
                  title="Customize Link"
                >
                  <Edit2 className="w-5 h-5" />
                </button>
                <div className="h-6 w-px bg-gray-300 hidden md:block"></div>
                <button 
                  onClick={handleCopy}
                  className={`flex-1 md:flex-none px-6 py-2.5 rounded-none text-sm font-bold flex items-center justify-center transition-all ${copied ? 'bg-brand-green text-white' : 'bg-brand-navy text-white hover:opacity-90'}`}
                >
                  {copied ? (
                    <><Check className="w-4 h-4 mr-2" /> Copied</>
                  ) : (
                    <><Copy className="w-4 h-4 mr-2" /> Copy</>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
        {error && (
          <div className="px-4 pb-2 text-xs text-red-500 font-medium">{error}</div>
        )}
      </div>

      {/* Action Row */}
      <div className="grid grid-cols-2 gap-4">
        <button 
          onClick={() => setShowQr(!showQr)}
          className={`flex items-center justify-center px-4 py-3 rounded-none border font-medium transition-all ${showQr ? 'bg-brand-primary/10 border-brand-primary/20 text-brand-primary' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}
        >
          <QrCode className="w-5 h-5 mr-2" />
          {showQr ? 'Hide QR' : 'QR Code'}
        </button>
        <button 
          onClick={handleReset}
          className="flex items-center justify-center px-4 py-3 rounded-none border border-gray-200 text-gray-600 font-medium hover:border-gray-300 hover:bg-gray-50 transition-all"
        >
          <RotateCcw className="w-5 h-5 mr-2" />
          Shorten Another
        </button>
      </div>

      {/* QR Code Panel */}
      {showQr && (
        <div className="mt-6 p-6 bg-white border-2 border-dashed border-gray-200 rounded-none flex flex-col items-center animate-fade-in">
          <img 
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(selectedDomain === host ? `${origin}/#/${currentLink?.alias || ''}` : `https://${selectedDomain}/${currentLink?.alias || ''}`)}&bgcolor=ffffff`} 
            alt="QR Code" 
            className="w-48 h-48 rounded-none mb-4 mix-blend-multiply"
          />
          <p className="text-sm text-gray-500 mt-2 text-center max-w-xs break-all">
            Scan to visit short link <br/>
            <span className="font-mono text-brand-primary font-bold">
              {selectedDomain === host ? `${host}/#/${currentLink?.alias}` : `${selectedDomain}/${currentLink?.alias}`}
            </span>
          </p>
          <button 
             onClick={() => {
                window.open(`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(selectedDomain === host ? `${origin}/#/${currentLink?.alias || ''}` : `https://${selectedDomain}/${currentLink?.alias || ''}`)}`, '_blank');
             }}
             className="mt-4 text-xs font-bold text-brand-primary hover:underline"
          >
            Download High Res
          </button>
        </div>
      )}
    </div>
  );
};
