import React, { useState, useMemo } from 'react';
import { ShortLink } from '../types';
import { Trash2, Copy, BarChart2, QrCode, ExternalLink, Share2, Check, Search, Plus, X } from 'lucide-react';

interface LinksListProps {
  links: ShortLink[];
  onDelete: (id: string) => void;
  onSimulateClick: (id: string) => void;
  onUpdateLink: (link: ShortLink) => void;
}

export const LinksList: React.FC<LinksListProps> = ({ links, onDelete, onSimulateClick, onUpdateLink }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeQrId, setActiveQrId] = useState<string | null>(null);
  const origin = window.location.origin;

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchField, setSearchField] = useState<'all' | 'alias' | 'tag'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7days' | '30days'>('all');

  // Tag Editor States
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [newTagText, setNewTagText] = useState('');

  const handleCopy = (fullUrl: string, id: string) => {
    navigator.clipboard.writeText(fullUrl);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleVisit = (link: ShortLink) => {
    onSimulateClick(link.id);
    window.open(link.originalUrl, '_blank');
  };

  const handleShare = async (fullUrl: string, link: ShortLink) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Shortened URL',
          text: `Check out this link: ${fullUrl}`,
          url: fullUrl,
        });
      } catch (err) {
        console.log('Share canceled or failed', err);
      }
    } else {
      handleCopy(fullUrl, link.id);
    }
  };

  // Add tag inline
  const handleAddTag = (e: React.FormEvent, link: ShortLink) => {
    e.preventDefault();
    if (!newTagText.trim()) return;
    const cleanTag = newTagText.trim().toLowerCase();
    const currentTags = link.tags || [];
    
    if (!currentTags.includes(cleanTag)) {
      const updatedLink = { ...link, tags: [...currentTags, cleanTag] };
      onUpdateLink(updatedLink);
    }
    
    setNewTagText('');
    setEditingLinkId(null);
  };

  // Remove tag inline
  const handleRemoveTag = (link: ShortLink, tagToRemove: string) => {
    const currentTags = link.tags || [];
    const updatedTags = currentTags.filter(t => t !== tagToRemove);
    const updatedLink = { ...link, tags: updatedTags };
    onUpdateLink(updatedLink);
  };

  const getFaviconUrl = (url: string) => {
    try {
      const hostname = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?sz=64&domain=${hostname}`;
    } catch (e) {
      return '';
    }
  };

  // 1. Gather all unique tags in database
  const allUniqueTags = useMemo(() => {
    const tagsSet = new Set<string>();
    links.forEach(link => {
      if (link.tags) {
        link.tags.forEach(t => tagsSet.add(t));
      }
    });
    return Array.from(tagsSet);
  }, [links]);

  // 2. Filter links based on query and date
  const filteredLinks = useMemo(() => {
    return links.filter(link => {
      // 2a. Search matching
      let matchesSearch = false;
      if (searchField === 'all') {
        matchesSearch = 
          link.alias.toLowerCase().includes(searchQuery.toLowerCase()) ||
          link.originalUrl.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (link.tags && link.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())));
      } else if (searchField === 'alias') {
        matchesSearch = link.alias.toLowerCase().includes(searchQuery.toLowerCase());
      } else if (searchField === 'tag') {
        matchesSearch = !!(link.tags && link.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())));
      }
      
      // 2b. Date matching
      let matchesDate = true;
      if (dateFilter !== 'all') {
        const linkDate = new Date(link.createdAt);
        const today = new Date();
        
        // Compute difference in calendar days
        const diffTime = Math.abs(today.getTime() - linkDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (dateFilter === 'today') {
          matchesDate = linkDate.toDateString() === today.toDateString();
        } else if (dateFilter === '7days') {
          matchesDate = diffDays <= 7;
        } else if (dateFilter === '30days') {
          matchesDate = diffDays <= 30;
        }
      }
        
      return matchesSearch && matchesDate;
    });
  }, [links, searchQuery, searchField, dateFilter]);

  if (links.length === 0) {
    return (
      <div className="text-center py-24 bg-white rounded-none border border-dashed border-gray-200 animate-fade-in">
        <div className="bg-gray-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
          <BarChart2 className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-xl font-bold text-gray-900">No links yet</h3>
        <p className="text-gray-500 mt-2 max-w-xs mx-auto">Shorten your first link above and see your premium analytics live!</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Search and Filters Header Panel */}
      <div className="bg-white p-4 border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in">
        
        {/* Search Group: Input + Dropdowns */}
        <div className="flex-1 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text"
              placeholder={
                searchField === 'all' ? "Search by alias, destination url, or tag..." :
                searchField === 'alias' ? "Search by alias..." : "Search by tag name..."
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 text-sm text-gray-900 border border-gray-150 focus:bg-white focus:outline-none focus:border-brand-primary rounded-none transition-all placeholder:text-gray-400"
            />
          </div>
          
          <div className="flex gap-2 flex-shrink-0">
            <select
              value={searchField}
              onChange={(e) => {
                setSearchField(e.target.value as 'all' | 'alias' | 'tag');
                setSearchQuery('');
              }}
              className="bg-gray-50 border border-gray-150 px-3 py-2.5 text-sm font-bold text-brand-navy focus:outline-none focus:border-brand-primary rounded-none transition-colors select-none cursor-pointer flex-1 sm:flex-none"
            >
              <option value="all">Search All</option>
              <option value="alias">Alias Only</option>
              <option value="tag">Tag Only</option>
            </select>

            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as 'all' | 'today' | '7days' | '30days')}
              className="bg-gray-50 border border-gray-150 px-3 py-2.5 text-sm font-bold text-brand-navy focus:outline-none focus:border-brand-primary rounded-none transition-colors select-none cursor-pointer flex-1 sm:flex-none"
            >
              <option value="all">All Dates</option>
              <option value="today">Created Today</option>
              <option value="7days">Past 7 Days</option>
              <option value="30days">Past 30 Days</option>
            </select>
          </div>
      </div>
    </div>

      {/* Filter Stats */}
      {(searchQuery || dateFilter !== 'all') && (
        <div className="text-xs font-bold text-gray-400 px-1 uppercase tracking-wider animate-fade-in flex justify-between items-center bg-gray-50/50 p-2 border border-gray-100">
          <span>Showing {filteredLinks.length} of {links.length} total links</span>
          <button 
            onClick={() => { setSearchQuery(''); setDateFilter('all'); }}
            className="text-[10px] text-brand-primary hover:underline hover:text-brand-primary/80 font-black cursor-pointer uppercase"
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* List container */}
      <div className="space-y-4">
        {filteredLinks.length === 0 ? (
          <div className="text-center py-16 bg-white border border-gray-100 text-gray-500">
            No links matched your search criteria.
          </div>
        ) : (
          filteredLinks.map((link) => {
            const shortUrl = link.domain && link.domain !== window.location.host
              ? `https://${link.domain}/${link.alias}`
              : `${origin}/${link.alias}`;
            const isQrOpen = activeQrId === link.id;
            const isEditingTags = editingLinkId === link.id;

            return (
              <div 
                key={link.id}
                className="bg-white rounded-none shadow-sm border border-gray-100 hover:border-brand-primary/20 transition-all duration-200 overflow-hidden animate-fade-in"
              >
                {/* Main Card Content */}
                <div className="p-4 md:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  
                  {/* Left: Favicon + Link details */}
                  <div className="flex items-start space-x-4 min-w-0 flex-1">
                    <div className="w-12 h-12 bg-gray-50 border border-gray-100 rounded-none flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden p-2">
                      <img 
                        src={getFaviconUrl(link.originalUrl)} 
                        alt="" 
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const parent = e.currentTarget.parentElement;
                          if (parent && !parent.querySelector('.favicon-fallback')) {
                            const fallback = document.createElement('div');
                            fallback.className = "favicon-fallback w-6 h-6 bg-gray-200 rounded-none flex items-center justify-center text-gray-500 text-xs font-bold select-none";
                            fallback.innerText = ">";
                            parent.appendChild(fallback);
                          }
                        }}
                        className="w-8 h-8 object-contain"
                      />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <a 
                          href={`/${link.alias}`} 
                          target="_blank"
                          rel="noreferrer"
                          className="font-extrabold text-brand-primary hover:text-brand-primary/80 text-lg hover:underline truncate"
                        >
                          {shortUrl}
                        </a>
                      </div>
                      <p className="text-sm text-gray-400 truncate max-w-xl mt-0.5">
                        {link.originalUrl}
                      </p>
                      {link.expiresAt && (
                        <p className={`text-xs mt-1 font-bold ${Date.now() > link.expiresAt ? 'text-brand-red' : 'text-gray-400'}`}>
                          {Date.now() > link.expiresAt ? 'Expired: ' : 'Expires: '}
                          {new Date(link.expiresAt).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      )}

                      {/* Clicks Stats & Dynamic Tags Manager */}
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        {/* Expiry Badge */}
                        {link.expiresAt && Date.now() > link.expiresAt && (
                          <span className="inline-flex items-center px-2 py-1 text-[10px] font-bold bg-brand-red/10 text-brand-red border border-brand-red/10 rounded-none uppercase tracking-wider">
                            Expired
                          </span>
                        )}

                        {/* Clicks Badge */}
                        <div className="inline-flex items-center text-xs font-semibold text-brand-navy bg-brand-primary/10 px-2.5 py-1.5 rounded-none border border-brand-primary/10">
                          <BarChart2 className="w-3.5 h-3.5 text-brand-primary mr-1.5" />
                          <span>{link.totalClicks} clicks</span>
                        </div>

                        {/* Tag Badges list with inline deletion */}
                        {link.tags && link.tags.map(tag => (
                          <span 
                            key={tag} 
                            className="inline-flex items-center px-2 py-1 text-[10px] font-bold bg-brand-primary/10 text-brand-primary rounded-none uppercase tracking-wider border border-brand-primary/5 group/tag hover:bg-brand-red/10 hover:text-brand-red hover:border-brand-red/15 transition-all select-none"
                          >
                            #{tag}
                            <button 
                              onClick={() => handleRemoveTag(link, tag)}
                              className="ml-1 text-[9px] hover:text-brand-red font-black"
                              title="Remove Tag"
                            >
                              ×
                            </button>
                          </span>
                        ))}

                        {/* Inline Tag Creator Form */}
                        {isEditingTags ? (
                          <form 
                            onSubmit={(e) => handleAddTag(e, link)}
                            className="flex items-center"
                          >
                            <input 
                              autoFocus
                              type="text"
                              placeholder="tag..."
                              value={newTagText}
                              onChange={(e) => setNewTagText(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                              className="w-16 px-1.5 py-0.5 text-xs text-brand-navy border border-brand-primary focus:outline-none bg-white rounded-none"
                            />
                            <button 
                              type="submit"
                              className="p-1 bg-brand-primary text-white hover:opacity-90 rounded-none text-[10px] flex items-center justify-center font-bold"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            <button 
                              type="button"
                              onClick={() => { setEditingLinkId(null); setNewTagText(''); }}
                              className="p-1 bg-gray-150 text-gray-500 hover:text-gray-700 rounded-none text-[10px] flex items-center justify-center"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </form>
                        ) : (
                          <button 
                            onClick={() => { setEditingLinkId(link.id); setNewTagText(''); }}
                            className="inline-flex items-center px-2.5 py-1 text-[10px] font-bold border border-dashed border-gray-300 hover:border-brand-primary text-gray-400 hover:text-brand-primary transition-colors rounded-none"
                            title="Add Tag"
                          >
                            <Plus className="w-2.5 h-2.5 mr-0.5" /> Tag
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handleVisit(link)}
                      className="flex items-center px-4 py-2.5 bg-brand-primary hover:opacity-90 text-white text-sm font-bold rounded-none transition-opacity shadow-sm flex-1 md:flex-none justify-center"
                    >
                      <ExternalLink className="w-4 h-4 mr-1.5" />
                      Visit URL
                    </button>

                    <button
                      onClick={() => setActiveQrId(isQrOpen ? null : link.id)}
                      className={`flex items-center px-4 py-2.5 text-sm font-bold rounded-none transition-all shadow-sm flex-1 md:flex-none justify-center ${
                        isQrOpen 
                          ? 'bg-brand-orange/20 text-brand-orange' 
                          : 'bg-brand-primary hover:opacity-90 text-white'
                      }`}
                    >
                      <QrCode className="w-4 h-4 mr-1.5" />
                      QR
                    </button>

                    <button
                      onClick={() => handleShare(shortUrl, link)}
                      className="flex items-center px-4 py-2.5 bg-brand-primary hover:opacity-90 text-white text-sm font-bold rounded-none transition-opacity shadow-sm flex-1 md:flex-none justify-center"
                    >
                      <Share2 className="w-4 h-4 mr-1.5" />
                      Share
                    </button>

                    <button
                      onClick={() => handleCopy(shortUrl, link.id)}
                      className={`flex items-center px-4 py-2.5 text-sm font-bold rounded-none transition-all shadow-sm flex-1 md:flex-none justify-center ${
                        copiedId === link.id 
                          ? 'bg-brand-green text-white' 
                          : 'bg-brand-navy hover:opacity-95 text-white'
                      }`}
                    >
                      {copiedId === link.id ? (
                        <>
                          <Check className="w-4 h-4 mr-1.5" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-1.5" />
                          Copy
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => onDelete(link.id)}
                      className="p-2.5 text-gray-400 hover:text-brand-red hover:bg-brand-red/10 rounded-none transition-all"
                      title="Delete"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>

                </div>

                {/* QR Panel Extension */}
                {isQrOpen && (
                  <div className="px-5 pb-5 pt-2 border-t border-gray-100 bg-gray-50 flex flex-col md:flex-row items-center gap-6 animate-fade-in">
                    <div className="p-3 bg-white rounded-none shadow-sm border border-gray-200">
                      <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(shortUrl)}&bgcolor=ffffff`} 
                        alt="QR Code" 
                        className="w-32 h-32 object-contain"
                      />
                    </div>
                    <div className="flex-1 text-center md:text-left space-y-2">
                      <h4 className="font-bold text-brand-navy">QR Code for your short link</h4>
                      <p className="text-sm text-gray-500 max-w-md">
                        Scan this QR code with your mobile camera to easily redirect to <span className="font-mono text-brand-primary font-bold break-all">{link.originalUrl}</span>
                      </p>
                      <button 
                         onClick={() => window.open(`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(shortUrl)}`, '_blank')}
                         className="text-xs font-bold text-brand-primary hover:underline font-mono"
                      >
                        Download High Resolution
                      </button>
                    </div>
                  </div>
                )}

              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
