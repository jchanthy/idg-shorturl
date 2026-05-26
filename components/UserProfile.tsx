import React, { useState, useEffect } from 'react';
import { User, Shield, BarChart2, Globe, Save, Trash2, Plus, Check, Loader, AlertCircle, Users } from 'lucide-react';
import { UserProfile as UserProfileType, ShortLink } from '../types';
import { auth } from '../services/firebase';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { getAllUserProfiles, saveUserProfileByAdmin, preRegisterUser, deleteUserProfile } from '../services/storageService';

interface UserProfileProps {
  userId: string;
  userEmail: string;
  links: ShortLink[];
  profile: UserProfileType | null;
  onSaveProfile: (data: Partial<UserProfileType>) => Promise<void>;
  onClose: () => void;
}



export const UserProfile: React.FC<UserProfileProps> = ({
  userId,
  userEmail,
  links,
  profile,
  onSaveProfile,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'usage' | 'domains' | 'admin'>('profile');
  
  // Tab: Profile States
  const [fullName, setFullName] = useState(profile?.fullName || auth.currentUser?.displayName || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl || auth.currentUser?.photoURL || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Tab: Security States
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPass, setUpdatingPass] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [passSuccess, setPassSuccess] = useState(false);

  // Tab: Custom Domain States
  const [newDomain, setNewDomain] = useState('');
  const [domainError, setDomainError] = useState<string | null>(null);
  const [domains, setDomains] = useState<string[]>(profile?.customDomains || []);

  // Tab: Admin States
  const [allUsers, setAllUsers] = useState<UserProfileType[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  // Tab: Admin Pre-registration States
  const [preName, setPreName] = useState('');
  const [preEmail, setPreEmail] = useState('');
  const [prePlan, setPrePlan] = useState<'free' | 'premium' | 'enterprise'>('free');
  const [preRole, setPreRole] = useState<'admin' | 'user'>('user');
  const [preRegistering, setPreRegistering] = useState(false);

  const handlePreRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preName || !preEmail) return;
    setPreRegistering(true);
    try {
      await preRegisterUser(preName, preEmail, prePlan, preRole);
      setPreName('');
      setPreEmail('');
      setPrePlan('free');
      setPreRole('user');
      
      // Refresh list
      const users = await getAllUserProfiles();
      setAllUsers(users);
      alert("User pre-registered successfully!");
    } catch (err: any) {
      alert(err.message || "Failed to pre-register user.");
    } finally {
      setPreRegistering(false);
    }
  };

  const handleAdminDeleteUser = async (userUid: string, email: string) => {
    if (window.confirm(`Are you sure you want to delete/revoke access for "${email}"?`)) {
      try {
        await deleteUserProfile(userUid);
        const users = await getAllUserProfiles();
        setAllUsers(users);
      } catch (err) {
        alert("Failed to delete user profile.");
      }
    }
  };

  useEffect(() => {
    if (activeTab === 'admin' && profile?.role === 'admin') {
      const fetchUsers = async () => {
        setLoadingUsers(true);
        setAdminError(null);
        try {
          const users = await getAllUserProfiles();
          setAllUsers(users);
        } catch (err) {
          setAdminError("Failed to fetch registered users list.");
        } finally {
          setLoadingUsers(false);
        }
      };
      fetchUsers();
    }
  }, [activeTab, profile]);

  const handleAdminSaveUser = async (userUid: string, updatedFields: Partial<UserProfileType>) => {
    try {
      await saveUserProfileByAdmin(userUid, updatedFields);
      // Refresh list
      const users = await getAllUserProfiles();
      setAllUsers(users);
    } catch (err) {
      alert("Failed to update user profile. Check permissions.");
    }
  };

  useEffect(() => {
    if (profile) {
      setFullName(profile.fullName || auth.currentUser?.displayName || '');
      setAvatarUrl(profile.avatarUrl || auth.currentUser?.photoURL || '');
      setDomains(profile.customDomains || []);
    }
  }, [profile]);

  // Compute stats for Usage tab
  const totalLinksCreated = links.length;
  const totalClicksRecorded = links.reduce((sum, link) => sum + link.totalClicks, 0);
  
  const linkLimit = profile?.linkLimit !== undefined ? profile.linkLimit : 100;
  const clickLimit = profile?.clickLimit !== undefined ? profile.clickLimit : 1000;
  const planType = profile?.planType || 'free';
  
  const linkPercent = linkLimit >= 999999 ? 0 : Math.min((totalLinksCreated / linkLimit) * 100, 100);
  const clickPercent = clickLimit >= 9999999 ? 0 : Math.min((totalClicksRecorded / clickLimit) * 100, 100);

  // 1. Profile Info Save
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileSuccess(false);
    try {
      await onSaveProfile({
        fullName,
        avatarUrl
      });
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingProfile(false);
    }
  };

  // 2. Avatar Base64 Upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1.5 * 1024 * 1024) {
      alert("Image is too large. Please select an image under 1.5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setAvatarUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // 3. Password Security Update
  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError(null);
    setPassSuccess(false);

    if (newPassword !== confirmPassword) {
      setPassError("New passwords do not match.");
      return;
    }

    if (newPassword.length < 6) {
      setPassError("Password must be at least 6 characters long.");
      return;
    }

    setUpdatingPass(true);

    try {
      const user = auth.currentUser;
      if (user && user.email) {
        // Re-authenticate first
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
        
        // Update password
        await updatePassword(user, newPassword);
        setPassSuccess(true);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPassError("No active user session found.");
      }
    } catch (err: any) {
      console.error("Re-authentication or password update failed:", err);
      if (err.code === 'auth/wrong-password') {
        setPassError("Current password is incorrect.");
      } else {
        setPassError(err.message || "Failed to update password. Please try again.");
      }
    } finally {
      setUpdatingPass(false);
    }
  };

  // 4. Custom Domains Add & Delete
  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    setDomainError(null);

    const cleanDomain = newDomain.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '');
    if (!cleanDomain) return;

    if (!/^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?$/.test(cleanDomain)) {
      setDomainError("Please enter a valid domain format (e.g. brand.link)");
      return;
    }

    if (domains.includes(cleanDomain)) {
      setDomainError("This domain is already added.");
      return;
    }

    const updatedDomains = [...domains, cleanDomain];
    setDomains(updatedDomains);
    setNewDomain('');
    await onSaveProfile({ customDomains: updatedDomains });
  };

  const handleDeleteDomain = async (domainToDelete: string) => {
    if (window.confirm(`Are you sure you want to remove the domain "${domainToDelete}"?`)) {
      const updatedDomains = domains.filter(d => d !== domainToDelete);
      setDomains(updatedDomains);
      await onSaveProfile({ customDomains: updatedDomains });
    }
  };

  return (
    <div className="bg-white rounded-none shadow-xl border border-gray-150 overflow-hidden w-full mx-auto flex flex-col md:flex-row min-h-[550px] animate-fade-in">
      
      {/* Sidebar Navigation */}
      <div className="w-full md:w-64 bg-brand-navy p-6 flex flex-col justify-between text-white border-r border-gray-100">
        <div>
          {/* User Info Preview */}
          <div className="flex items-center space-x-3.5 mb-8 pb-6 border-b border-white/10">
            <div className="w-12 h-12 bg-white/10 rounded-none overflow-hidden flex-shrink-0 border border-white/20">
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0">
              <h4 className="font-extrabold text-sm truncate uppercase tracking-wider">{fullName || 'Admin User'}</h4>
              <p className="text-xs text-gray-400 truncate">{userEmail}</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            <button
              onClick={() => setActiveTab('profile')}
              className={`w-full flex items-center px-4 py-3 text-sm font-bold uppercase tracking-wider transition-colors rounded-none gap-3 text-left ${
                activeTab === 'profile'
                  ? 'bg-brand-primary text-white'
                  : 'text-gray-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <User className="w-4.5 h-4.5" />
              Edit Profile
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`w-full flex items-center px-4 py-3 text-sm font-bold uppercase tracking-wider transition-colors rounded-none gap-3 text-left ${
                activeTab === 'security'
                  ? 'bg-brand-primary text-white'
                  : 'text-gray-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Shield className="w-4.5 h-4.5" />
              Security Settings
            </button>
            <button
              onClick={() => setActiveTab('usage')}
              className={`w-full flex items-center px-4 py-3 text-sm font-bold uppercase tracking-wider transition-colors rounded-none gap-3 text-left ${
                activeTab === 'usage'
                  ? 'bg-brand-primary text-white'
                  : 'text-gray-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <BarChart2 className="w-4.5 h-4.5" />
              Usage Limits
            </button>
            <button
              onClick={() => setActiveTab('domains')}
              className={`w-full flex items-center px-4 py-3 text-sm font-bold uppercase tracking-wider transition-colors rounded-none gap-3 text-left ${
                activeTab === 'domains'
                  ? 'bg-brand-primary text-white'
                  : 'text-gray-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Globe className="w-4.5 h-4.5" />
              Custom Domains
            </button>
            {profile?.role === 'admin' && (
              <button
                onClick={() => setActiveTab('admin')}
                className={`w-full flex items-center px-4 py-3 text-sm font-bold uppercase tracking-wider transition-colors rounded-none gap-3 text-left ${
                  activeTab === 'admin'
                    ? 'bg-brand-primary text-white'
                    : 'text-brand-primary hover:bg-white/5'
                }`}
              >
                <Users className="w-4.5 h-4.5" />
                Admin Console 👑
              </button>
            )}
          </nav>
        </div>

        <button
          onClick={onClose}
          className="mt-8 md:mt-0 w-full py-2.5 bg-white/10 hover:bg-white/15 text-white text-xs font-bold uppercase tracking-widest transition-colors rounded-none"
        >
          Back To Dashboard
        </button>
      </div>

      {/* Main Configurations Body */}
      <div className="flex-1 p-8 md:p-10">
        
        {/* Tab content: EDIT PROFILE */}
        {activeTab === 'profile' && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h2 className="text-2xl font-extrabold text-brand-navy uppercase">Profile Details</h2>
              <p className="text-sm text-gray-500 mt-1">Configure your personal information and avatar settings.</p>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-6">
              {/* Profile Avatar selection */}
              <div className="space-y-3">
                <label className="block text-xs font-black text-brand-navy uppercase tracking-wider">
                  Select Profile Avatar
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="w-16 h-16 bg-gray-50 border border-gray-200 rounded-none overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Preview Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-8 h-8 text-gray-400" />
                    )}
                  </div>
                </div>
                
                {/* File Uploader */}
                <div className="mt-4">
                  <label className="inline-flex items-center px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-200 text-xs font-bold text-gray-700 uppercase cursor-pointer rounded-none select-none transition-colors">
                    Upload Custom Image
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleImageUpload} 
                      className="hidden" 
                    />
                  </label>
                  <span className="text-[10px] text-gray-400 ml-3">PNG, JPG under 1.5MB</span>
                </div>
              </div>

              {/* Name Details */}
              <div className="space-y-2">
                <label className="block text-xs font-black text-brand-navy uppercase tracking-wider">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-150 text-sm text-gray-900 focus:bg-white focus:outline-none focus:border-brand-primary rounded-none transition-colors font-bold"
                />
              </div>

              {/* Email details readonly */}
              <div className="space-y-2">
                <label className="block text-xs font-black text-brand-navy uppercase tracking-wider opacity-60">
                  Account Email Address
                </label>
                <input
                  type="email"
                  disabled
                  value={userEmail}
                  className="w-full px-4 py-3 bg-gray-100/70 border border-gray-200 text-sm text-gray-400 rounded-none cursor-not-allowed select-none font-bold"
                />
              </div>

              {/* Save Alert */}
              {profileSuccess && (
                <div className="p-3 bg-brand-primary/10 border border-brand-primary/20 text-xs text-brand-primary font-bold uppercase tracking-wider flex items-center">
                  <Check className="w-4 h-4 mr-2" /> Profile Details Saved Successfully!
                </div>
              )}

              <button
                type="submit"
                disabled={savingProfile}
                className="flex items-center justify-center px-6 py-3.5 bg-brand-primary hover:opacity-90 text-white text-sm font-bold uppercase tracking-wider rounded-none shadow-md shadow-brand-primary/15 transition-opacity"
              >
                {savingProfile ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" /> Save Profile Details
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Tab content: SECURITY PANEL */}
        {activeTab === 'security' && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h2 className="text-2xl font-extrabold text-brand-navy uppercase">Security Settings</h2>
              <p className="text-sm text-gray-500 mt-1">Change your account password safely.</p>
            </div>

            <form onSubmit={handlePasswordUpdate} className="space-y-5">
              <div className="space-y-2">
                <label className="block text-xs font-black text-brand-navy uppercase tracking-wider">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-150 text-sm text-gray-900 focus:bg-white focus:outline-none focus:border-brand-primary rounded-none transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-black text-brand-navy uppercase tracking-wider">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="Enter new password (min. 6 chars)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-150 text-sm text-gray-900 focus:bg-white focus:outline-none focus:border-brand-primary rounded-none transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-black text-brand-navy uppercase tracking-wider">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-150 text-sm text-gray-900 focus:bg-white focus:outline-none focus:border-brand-primary rounded-none transition-colors"
                />
              </div>

              {passError && (
                <div className="p-3 bg-brand-red/10 border border-brand-red/20 text-xs text-brand-red font-bold uppercase tracking-wider flex items-center">
                  <AlertCircle className="w-4 h-4 mr-2" /> {passError}
                </div>
              )}

              {passSuccess && (
                <div className="p-3 bg-brand-primary/10 border border-brand-primary/20 text-xs text-brand-primary font-bold uppercase tracking-wider flex items-center">
                  <Check className="w-4 h-4 mr-2" /> Password Updated Successfully!
                </div>
              )}

              <button
                type="submit"
                disabled={updatingPass}
                className="flex items-center justify-center px-6 py-3.5 bg-brand-navy hover:opacity-95 text-white text-sm font-bold uppercase tracking-wider rounded-none shadow-md transition-opacity"
              >
                {updatingPass ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" /> Verifying...
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4 mr-2" /> Update Password
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Tab content: USAGE MANAGEMENT */}
        {activeTab === 'usage' && (
          <div className="space-y-8 animate-fade-in">
            <div>
              <h2 className="text-2xl font-extrabold text-brand-navy uppercase">Usage Management</h2>
              <p className="text-sm text-gray-500 mt-1">Review and upgrade your account subscription tier.</p>
            </div>

            <div className="space-y-6">
              {/* Plan Switcher Dropdown */}
              <div className="bg-gray-50 border border-gray-100 p-6 space-y-3">
                <label className="block text-xs font-black text-brand-navy uppercase tracking-wider">
                  Select Subscription Plan (Upgrade dynamically)
                </label>
                <select
                  value={planType}
                  onChange={async (e) => {
                    const nextPlan = e.target.value as 'free' | 'premium' | 'enterprise';
                    let nextLinkLimit = 100;
                    let nextClickLimit = 1000;
                    if (nextPlan === 'premium') {
                      nextLinkLimit = 1000;
                      nextClickLimit = 20000;
                    } else if (nextPlan === 'enterprise') {
                      nextLinkLimit = 999999;
                      nextClickLimit = 9999999;
                    }
                    await onSaveProfile({
                      planType: nextPlan,
                      linkLimit: nextLinkLimit,
                      clickLimit: nextClickLimit
                    });
                  }}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 text-sm text-brand-navy font-bold focus:outline-none focus:border-brand-primary rounded-none transition-colors select-none cursor-pointer"
                >
                  <option value="free">Free Tier (100 Links, 1,000 Clicks)</option>
                  <option value="premium">Premium Pro Tier (1,000 Links, 20,000 Clicks)</option>
                  <option value="enterprise">Enterprise VIP Tier (Unlimited Links & Clicks)</option>
                </select>
              </div>

              {/* Links Progress */}
              <div className="bg-gray-50 border border-gray-100 p-6 space-y-3">
                <div className="flex justify-between items-center text-sm font-bold text-brand-navy">
                  <span className="uppercase tracking-wider">Shortlinks Created</span>
                  <span>{totalLinksCreated} / {linkLimit >= 999999 ? 'Unlimited' : `${linkLimit} Links`}</span>
                </div>
                {linkLimit < 999999 ? (
                  <>
                    <div className="w-full bg-gray-200 h-3 overflow-hidden rounded-none shadow-inner">
                      <div 
                        className="bg-brand-primary h-full transition-all duration-500" 
                        style={{ width: `${linkPercent}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase">
                      You have consumed {linkPercent.toFixed(1)}% of your lifetime link capacity.
                    </p>
                  </>
                ) : (
                  <p className="text-[10px] text-brand-primary font-bold uppercase">
                    You have unlimited shortlink capacity active!
                  </p>
                )}
              </div>

              {/* Clicks Progress */}
              <div className="bg-gray-50 border border-gray-100 p-6 space-y-3">
                <div className="flex justify-between items-center text-sm font-bold text-brand-navy">
                  <span className="uppercase tracking-wider">Total Clicks Tracked</span>
                  <span>{totalClicksRecorded} / {clickLimit >= 9999999 ? 'Unlimited' : `${clickLimit} Clicks`}</span>
                </div>
                {clickLimit < 9999999 ? (
                  <>
                    <div className="w-full bg-gray-200 h-3 overflow-hidden rounded-none shadow-inner">
                      <div 
                        className="bg-brand-primary h-full transition-all duration-500" 
                        style={{ width: `${clickPercent}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase">
                      You have consumed {clickPercent.toFixed(1)}% of your monthly trackable clicks capacity.
                    </p>
                  </>
                ) : (
                  <p className="text-[10px] text-brand-primary font-bold uppercase">
                    You have unlimited trackable click capacity active!
                  </p>
                )}
              </div>

              {/* Status Plan Badge Card */}
              <div className="p-6 bg-brand-primary/10 border border-brand-primary/20 flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <h4 className="font-extrabold text-brand-navy text-lg uppercase tracking-wide">
                    {planType === 'free' ? 'Free Starter Tier' : planType === 'premium' ? 'Premium Professional Account' : 'Enterprise Branded Account'}
                  </h4>
                  <p className="text-xs text-gray-500 mt-1">Providing dynamic firestore syncing and branded domain customizations.</p>
                </div>
                <span className="px-4 py-1.5 bg-brand-navy text-white text-xs font-black tracking-widest uppercase rounded-none">
                  {planType} PLAN
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tab content: BRANDED DOMAINS */}
        {activeTab === 'domains' && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h2 className="text-2xl font-extrabold text-brand-navy uppercase">Branded Custom Domains</h2>
              <p className="text-sm text-gray-500 mt-1">Configure your personal domains to point to your shortened links.</p>
            </div>

            {/* Custom Domain Form */}
            <form onSubmit={handleAddDomain} className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="ex. link.mybrand.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-150 text-sm text-gray-900 focus:bg-white focus:outline-none focus:border-brand-primary rounded-none transition-colors font-bold placeholder:text-gray-400"
                />
              </div>
              <button
                type="submit"
                className="px-5 py-3 bg-brand-primary hover:opacity-90 text-white text-sm font-bold uppercase tracking-wider rounded-none flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Add Domain
              </button>
            </form>

            {domainError && (
              <div className="p-3 bg-brand-red/10 border border-brand-red/15 text-xs text-brand-red font-bold uppercase tracking-wider flex items-center">
                <AlertCircle className="w-4 h-4 mr-2" /> {domainError}
              </div>
            )}

            {/* Domains List */}
            <div className="space-y-3">
              <label className="block text-xs font-black text-brand-navy uppercase tracking-wider">
                Configured Custom Domains ({domains.length})
              </label>

              {domains.length === 0 ? (
                <div className="text-center py-10 bg-gray-50 border border-gray-150 text-gray-400 text-sm font-bold uppercase tracking-wider">
                  No custom domains added yet.
                </div>
              ) : (
                <div className="divide-y divide-gray-100 border border-gray-150 bg-white">
                  {domains.map((domain) => (
                    <div key={domain} className="p-4 flex items-center justify-between gap-4 font-bold text-sm text-brand-navy">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4.5 h-4.5 text-brand-primary" />
                        <span>{domain}</span>
                      </div>
                      <button
                        onClick={() => handleDeleteDomain(domain)}
                        className="p-1.5 text-gray-400 hover:text-brand-red transition-colors"
                        title="Remove Domain"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab content: ADMIN CONSOLE */}
        {activeTab === 'admin' && profile?.role === 'admin' && (
          <div className="space-y-8 animate-fade-in text-brand-navy">
            <div>
              <h2 className="text-2xl font-extrabold text-brand-navy uppercase">Admin Management Dashboard 👑</h2>
              <p className="text-sm text-gray-500 mt-1">Review and manage registered users, pre-register/invite emails, adjust API limits, and delegate administrative roles.</p>
            </div>

            {/* Pre-register / Invite Form */}
            <div className="bg-gray-50 border border-gray-150 p-6 space-y-4">
              <div>
                <h3 className="text-sm font-black text-brand-navy uppercase tracking-wider">Pre-authorize / Invite User by Email</h3>
                <p className="text-[11px] text-gray-500 mt-0.5">Invite new users or clients to log in. Only pre-registered emails will be authorized to access the system.</p>
              </div>

              <form onSubmit={handlePreRegister} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                <div className="space-y-1.5 lg:col-span-1.5">
                  <label className="block text-[10px] font-black text-brand-navy uppercase tracking-wider">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter full name"
                    value={preName}
                    onChange={(e) => setPreName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200 text-xs text-brand-navy font-bold focus:outline-none focus:border-brand-primary rounded-none transition-colors"
                  />
                </div>

                <div className="space-y-1.5 lg:col-span-1.5">
                  <label className="block text-[10px] font-black text-brand-navy uppercase tracking-wider">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="client@idg.edu.kh"
                    value={preEmail}
                    onChange={(e) => setPreEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200 text-xs text-brand-navy font-bold focus:outline-none focus:border-brand-primary rounded-none transition-colors"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-brand-navy uppercase tracking-wider">Plan Tier</label>
                  <select
                    value={prePlan}
                    onChange={(e) => setPrePlan(e.target.value as any)}
                    className="w-full px-2 py-2 bg-white border border-gray-200 text-xs text-brand-navy font-bold focus:outline-none focus:border-brand-primary rounded-none cursor-pointer"
                  >
                    <option value="free">Free Starter</option>
                    <option value="premium">Premium Pro</option>
                    <option value="enterprise">Enterprise VIP</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-brand-navy uppercase tracking-wider">System Role</label>
                  <select
                    value={preRole}
                    onChange={(e) => setPreRole(e.target.value as any)}
                    className="w-full px-2 py-2 bg-white border border-gray-200 text-xs text-brand-navy font-bold focus:outline-none focus:border-brand-primary rounded-none cursor-pointer"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={preRegistering}
                  className="w-full py-2 bg-brand-primary hover:opacity-90 text-white text-xs font-black uppercase tracking-wider rounded-none flex items-center justify-center gap-1 min-h-[38px] transition-opacity"
                >
                  {preRegistering ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Authorize
                </button>
              </form>
            </div>

            {loadingUsers ? (
              <div className="flex items-center justify-center py-20">
                <Loader className="w-8 h-8 text-brand-primary animate-spin" />
              </div>
            ) : adminError ? (
              <div className="p-4 bg-brand-red/10 border border-brand-red/15 text-xs text-brand-red font-bold uppercase tracking-wider">
                {adminError}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-brand-navy p-4 flex justify-between items-center text-white text-xs font-black uppercase tracking-wider rounded-none">
                  <span>Registered Users ({allUsers.length})</span>
                  <span>Limits & Subscriptions settings</span>
                </div>
                
                <div className="divide-y divide-gray-150 border border-gray-150 bg-white">
                  {allUsers.map((u) => {
                    const isPreRegistered = u.uid.startsWith('temp_');
                    return (
                      <div key={u.uid} className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6 hover:bg-gray-50/50 transition-colors">
                        
                        {/* Left side: Avatar & Info */}
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-12 h-12 bg-gray-100 border border-gray-200 rounded-none overflow-hidden flex-shrink-0 flex items-center justify-center relative">
                            {isPreRegistered ? (
                              <div className="absolute inset-0 bg-brand-primary/10 flex items-center justify-center text-brand-primary font-black text-xs select-none">INV</div>
                            ) : u.avatarUrl ? (
                              <img src={u.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                              <User className="w-6 h-6 text-gray-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-extrabold text-brand-navy text-sm flex items-center gap-2 truncate uppercase tracking-wider">
                              <span>{u.fullName || 'User'}</span>
                              {u.uid === userId && <span className="text-[9px] px-1.5 py-0.5 bg-brand-primary/15 text-brand-primary font-black uppercase rounded-none select-none">YOU</span>}
                              {isPreRegistered && <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/15 text-amber-600 font-black uppercase rounded-none select-none">Pending Sign-In</span>}
                            </h4>
                            <p className="text-xs text-gray-400 font-medium truncate mt-0.5">{u.email || u.uid}</p>
                          </div>
                        </div>

                        {/* Right side: Subscription, Role Settings and Delete Actions */}
                        <div className="flex flex-wrap lg:flex-nowrap items-center gap-4 lg:gap-6 flex-shrink-0">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            
                            {/* Plan selection */}
                            <div className="space-y-1">
                              <label className="block text-[9px] font-black text-brand-navy uppercase tracking-wider">Plan Tier</label>
                              <select
                                value={u.planType || 'free'}
                                onChange={(e) => {
                                  const plan = e.target.value as 'free' | 'premium' | 'enterprise';
                                  let linkL = u.linkLimit || 100;
                                  let clickL = u.clickLimit || 1000;
                                  if (plan === 'free') { linkL = 100; clickL = 1000; }
                                  else if (plan === 'premium') { linkL = 1000; clickL = 20000; }
                                  else if (plan === 'enterprise') { linkL = 999999; clickL = 9999999; }
                                  
                                  handleAdminSaveUser(u.uid, { 
                                    planType: plan, 
                                    linkLimit: linkL,
                                    clickLimit: clickL 
                                  });
                                }}
                                className="w-full px-2 py-1.5 bg-white border border-gray-200 text-xs text-brand-navy font-bold focus:outline-none focus:border-brand-primary rounded-none select-none cursor-pointer"
                              >
                                <option value="free">Free Starter</option>
                                <option value="premium">Premium Pro</option>
                                <option value="enterprise">Enterprise VIP</option>
                              </select>
                            </div>

                            {/* Link Limit */}
                            <div className="space-y-1">
                              <label className="block text-[9px] font-black text-brand-navy uppercase tracking-wider">Link Limit</label>
                              <input
                                type="number"
                                value={u.linkLimit === 999999 ? '' : (u.linkLimit || 100)}
                                placeholder="Unlimited"
                                onChange={(e) => {
                                  const val = e.target.value === '' ? 999999 : parseInt(e.target.value);
                                  handleAdminSaveUser(u.uid, { linkLimit: val });
                                }}
                                className="w-full px-2 py-1 bg-white border border-gray-200 text-xs text-brand-navy font-bold focus:outline-none focus:border-brand-primary rounded-none"
                              />
                            </div>

                            {/* Click Limit */}
                            <div className="space-y-1">
                              <label className="block text-[9px] font-black text-brand-navy uppercase tracking-wider">Click Limit</label>
                              <input
                                type="number"
                                value={u.clickLimit === 9999999 ? '' : (u.clickLimit || 1000)}
                                placeholder="Unlimited"
                                onChange={(e) => {
                                  const val = e.target.value === '' ? 9999999 : parseInt(e.target.value);
                                  handleAdminSaveUser(u.uid, { clickLimit: val });
                                }}
                                className="w-full px-2 py-1 bg-white border border-gray-200 text-xs text-brand-navy font-bold focus:outline-none focus:border-brand-primary rounded-none"
                              />
                            </div>

                            {/* User Role */}
                            <div className="space-y-1">
                              <label className="block text-[9px] font-black text-brand-navy uppercase tracking-wider">Role Option</label>
                              <select
                                value={u.role || 'user'}
                                disabled={u.uid === userId} // Cannot demote yourself
                                onChange={(e) => {
                                  const nextRole = e.target.value as 'admin' | 'user';
                                  if (window.confirm(`Are you sure you want to change this user's role to ${nextRole.toUpperCase()}?`)) {
                                    handleAdminSaveUser(u.uid, { role: nextRole });
                                  }
                                }}
                                className={`w-full px-2 py-1.5 bg-white border border-gray-200 text-xs font-bold focus:outline-none focus:border-brand-primary rounded-none select-none cursor-pointer ${
                                  u.role === 'admin' ? 'text-brand-primary' : 'text-brand-navy'
                                }`}
                              >
                                <option value="user">User</option>
                                <option value="admin">⭐ Admin</option>
                              </select>
                            </div>

                          </div>
                          
                          {/* Revoke/Delete User Profile Button */}
                          {u.uid !== userId && (
                            <button
                              onClick={() => handleAdminDeleteUser(u.uid, u.email || 'this user')}
                              className="p-2 border border-gray-200 text-gray-400 hover:text-brand-red hover:border-brand-red/30 transition-all rounded-none self-end lg:self-center mt-3 lg:mt-0"
                              title="Revoke access & Delete profile"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
