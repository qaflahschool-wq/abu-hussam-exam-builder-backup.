import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User, Subject, SchoolIdentitySettings, NotificationItem } from '../types/index.ts';
import { api } from '../services/api.ts';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isPlatformOwner: boolean;
  isSchoolAdmin: boolean;
  isAdmin: boolean; // True for PlatformOwner or SchoolAdmin management screens
  hasAIAccess: boolean; // Strictly true ONLY for PlatformOwner (أبوحسام)
  schoolIdentity: SchoolIdentitySettings | null;
  subjects: Subject[];
  notifications: NotificationItem[];
  unreadNotificationsCount: number;
  pendingRegistrationsCount: number;
  login: (username: string, pass: string) => Promise<void>;
  logout: () => void;
  switchUser: (userId: string) => Promise<void>;
  availableUsers: User[];
  refreshUsers: () => Promise<void>;
  refreshSubjects: () => Promise<void>;
  refreshSchoolIdentity: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEFAULT_SCHOOL_IDENTITY: SchoolIdentitySettings = {
  schoolNameAr: 'مدرسة قفلة للتعليم الأساسي',
  schoolNameEn: 'QAFLAH SCHOOL',
  countryTitleAr: 'الجمهورية اليمنية',
  countryTitleEn: 'Republic of Yemen',
  ministryTitleAr: 'وزارة التربية والتعليم',
  ministryTitleEn: 'Ministry of Education',
  logoUrl: '/assets/aistudio/1793675145730_f04991e4.jpg',
  primaryColor: '#1B5E3A',
  defaultAcademicYear: '2026 / 2027',
  defaultTerm: 'الفصل الدراسي الأول',
  defaultShowTeacherName: true,
  defaultHeaderLanguage: 'ar',
  defaultHeaderCompact: false,
  footerNoteAr: 'مدرسة قفلة للتعليم الأساسي – الجمهورية اليمنية',
  footerNoteEn: 'QAFLAH BASIC EDUCATION SCHOOL - YEMEN',
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentitySettings | null>(DEFAULT_SCHOOL_IDENTITY);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState<number>(0);
  const [pendingRegistrationsCount, setPendingRegistrationsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const userRef = useRef<User | null>(null);
  const loadingRef = useRef<boolean>(true);
  const loggingOutRef = useRef<boolean>(false);
  userRef.current = user;
  loadingRef.current = loading;

  const refreshSchoolIdentity = async () => {
    try {
      const identity = await api.getSchoolIdentity();
      setSchoolIdentity(identity);
    } catch {
      setSchoolIdentity(DEFAULT_SCHOOL_IDENTITY);
    }
  };

  const refreshSubjects = async () => {
    try {
      const list = await api.getSubjects(false);
      setSubjects(list);
    } catch {
      // Ignore if unauthenticated
    }
  };

  const fetchUsers = async () => {
    try {
      const list = await api.getUsers();
      setAvailableUsers(list);
    } catch {
      setAvailableUsers([]);
    }
  };

  const refreshNotifications = useCallback(async (targetUser?: User | null) => {
    const active = targetUser ?? user;
    if (!active) {
      setNotifications([]);
      setUnreadNotificationsCount(0);
      setPendingRegistrationsCount(0);
      return;
    }
    try {
      const res = await api.getNotifications();
      setNotifications(res.notifications || []);
      setUnreadNotificationsCount(res.unreadCount || 0);
      if (active.role === 'PlatformOwner' || active.role === 'Administrator') {
        const reqs = await api.getRegistrationRequests('PENDING_APPROVAL');
        const editReqs = await api.getRegistrationRequests('NEEDS_EDIT');
        setPendingRegistrationsCount((reqs?.length || 0) + (editReqs?.length || 0));
      } else {
        setPendingRegistrationsCount(0);
      }
    } catch {
      // Non-fatal
    }
  }, [user]);

  const markNotificationRead = async (id: string) => {
    await api.markNotificationRead(id);
    await refreshNotifications();
  };

  const markAllNotificationsRead = async () => {
    await api.markAllNotificationsRead();
    await refreshNotifications();
  };

  const bootstrapAuthenticatedUser = async (authenticatedUser: User) => {
    setUser(authenticatedUser);
    await refreshSubjects();
    if (authenticatedUser.role === 'PlatformOwner' || authenticatedUser.role === 'Administrator' || authenticatedUser.role === 'SchoolAdmin') {
      await fetchUsers();
    } else {
      setAvailableUsers([]);
    }
    await refreshNotifications(authenticatedUser);
  };

  useEffect(() => {
    const initAuth = async () => {
      await refreshSchoolIdentity();
      try {
        const savedToken = localStorage.getItem('abuhussam_auth_token');
        if (!savedToken) {
          setUser(null);
          return;
        }
        api.setAuthToken(savedToken);
        const { user: me } = await api.getCurrentUser();
        await bootstrapAuthenticatedUser(me);
      } catch {
        localStorage.removeItem('abuhussam_auth_token');
        api.setAuthToken('');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    initAuth();
  }, []);

  // Poll notifications periodically when logged in
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      refreshNotifications(user);
    }, 25000);
    return () => clearInterval(interval);
  }, [user?.id, refreshNotifications]);

  const login = async (username: string, pass: string) => {
    const res = await api.login(username, pass);
    if (res.success && res.user && res.token) {
      api.setAuthToken(res.token);
      localStorage.setItem('abuhussam_auth_token', res.token);
      await bootstrapAuthenticatedUser(res.user);
    }
  };

  const logout = useCallback(() => {
    userRef.current = null;
    loggingOutRef.current = false;
    localStorage.removeItem('abuhussam_auth_token');
    localStorage.removeItem('abuhussam_active_user_id');
    api.setAuthToken('');
    setUser(null);
    setAvailableUsers([]);
    setSubjects([]);
    setNotifications([]);
    setUnreadNotificationsCount(0);
    setPendingRegistrationsCount(0);
  }, []);

  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      if (loadingRef.current || !userRef.current || loggingOutRef.current) {
        return;
      }
      loggingOutRef.current = true;
      logout();
    });
    return () => api.setUnauthorizedHandler(undefined);
  }, [logout]);

  const switchUser = async (userId: string) => {
    const res = await api.switchUser(userId);
    if (res.success && res.user && res.token) {
      api.setAuthToken(res.token);
      localStorage.setItem('abuhussam_auth_token', res.token);
      await bootstrapAuthenticatedUser(res.user);
    }
  };

  const isPlatformOwner = Boolean(user && (user.role === 'PlatformOwner' || user.role === 'Administrator'));
  const isSchoolAdmin = Boolean(user && user.role === 'SchoolAdmin');
  const isAdmin = isPlatformOwner || isSchoolAdmin;
  const hasAIAccess = Boolean(user && isPlatformOwner && user.hasAIAccess === true);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isPlatformOwner,
        isSchoolAdmin,
        isAdmin,
        hasAIAccess,
        schoolIdentity,
        subjects,
        notifications,
        unreadNotificationsCount,
        pendingRegistrationsCount,
        login,
        logout,
        switchUser,
        availableUsers,
        refreshUsers: fetchUsers,
        refreshSubjects,
        refreshSchoolIdentity,
        refreshNotifications: () => refreshNotifications(),
        markNotificationRead,
        markAllNotificationsRead,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
