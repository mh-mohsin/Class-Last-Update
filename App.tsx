import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  writeBatch,
  setDoc,
  getDoc
} from 'firebase/firestore';
// Consolidate Auth imports and use 'type' for User interface to avoid build errors
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  type User 
} from 'firebase/auth';
import { 
  ResponsiveContainer, 
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from './firebase';
import { ClassData, ActiveTab, CATEGORIES_MAP } from './types';
import { INITIAL_CLASSES } from './data';
import { 
  Play, 
  Trash, 
  Edit, 
  Plus, 
  Search, 
  Calendar, 
  BookOpen, 
  CheckCircle, 
  XCircle, 
  List, 
  Database,
  Loader2,
  LayoutDashboard,
  BarChart3,
  ChevronRight,
  ArrowLeft,
  CheckCircle2,
  LogOut,
  User as UserIcon,
  Layers,
  CheckSquare,
  Trophy,
  History,
  TrendingUp,
  Award,
  Zap,
  Target
} from 'lucide-react';

const App: React.FC = () => {
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [userProgress, setUserProgress] = useState<string[]>([]);
  const [completionDates, setCompletionDates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'student'>('student');
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
  const [isAddingNewSubject, setIsAddingNewSubject] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [editingMentorSubject, setEditingMentorSubject] = useState<string | null>(null);
  const [newMentorName, setNewMentorName] = useState('');
  const [subjectMentors, setSubjectMentors] = useState<Record<string, string>>({});

  const handleSyncCategories = async () => {
    if (!confirm('This will safely update the category names of your existing classes to match the new structure. No classes will be deleted. Continue?')) return;
    setIsSeeding(true);
    try {
      const batch = writeBatch(db);
      let updatedCount = 0;
      
      classes.forEach((cls) => {
        // Migration for Family Laws based on subject OR specific topics mentioned by user
        const normalizedTopic = cls.topic?.trim().toLowerCase();
        const isFamilyTopic = normalizedTopic === 'orientation class' || normalizedTopic === 'পারিবারিক আদালত আইন, ২০২৩' || normalizedTopic === 'পারিবারিক আদালত আইন ২০২৩';
        const normalizedSubject = cls.subject?.trim();
        const isOldFamilySubject = normalizedSubject === 'Muslim Laws' || normalizedSubject === 'Muslim Family Laws Ordinance, 1961' || normalizedSubject === 'Dissolution of Muslim Marriages Act, 1939';

        if (isFamilyTopic || isOldFamilySubject) {
          if (cls.category !== 'Family Laws' || normalizedSubject !== 'Muslim Law') {
            batch.update(doc(db, 'classes', cls.id!), { 
              category: 'Family Laws',
              subject: 'Muslim Law'
            });
            updatedCount++;
          }
          return;
        }

        // Find which category this subject belongs to in our current map
        let correctCategory = '';
        for (const [cat, subjects] of Object.entries(CATEGORIES_MAP)) {
          if (subjects.includes(normalizedSubject) || (cat === 'Special Laws' && normalizedSubject?.startsWith('Special Laws'))) {
            correctCategory = cat;
            break;
          }
        }
        
        // Special case for old "Special Laws" subjects that might have been renamed to "Special Laws"
        // or if the category was different
        if (normalizedSubject === 'Special Laws') {
          let specificSubject = 'Special Laws';
          if (normalizedTopic.includes('দুদক বিধিমালা')) specificSubject = 'Special Laws - দুদক বিধিমালা';
          else if (normalizedTopic.includes('দুদক আইন')) specificSubject = 'Special Laws - দুদক আইন';
          else if (normalizedTopic.includes('claa 1958') || normalizedTopic.includes('criminal law amendment')) specificSubject = 'Special Laws - CLAA 1958';
          else if (normalizedTopic.includes('ni act') || normalizedTopic.includes('negotiable instruments')) specificSubject = 'Special Laws - NI Act';
          else if (normalizedTopic.includes('সাইবার সুরক্ষা')) specificSubject = 'Special Laws - সাইবার সুরক্ষা';
          else if (normalizedTopic.includes('মানব পাচার')) specificSubject = 'Special Laws - মানব পাচার';
          else if (normalizedTopic.includes('দ্রুত বিচার')) specificSubject = 'Special Laws - দ্রুত বিচার';

          if (cls.category !== 'Special Laws' || cls.subject !== specificSubject) {
            batch.update(doc(db, 'classes', cls.id!), { 
              category: 'Special Laws',
              subject: specificSubject
            });
            updatedCount++;
          }
          return;
        }

        if (correctCategory && cls.category !== correctCategory) {
          batch.update(doc(db, 'classes', cls.id!), { category: correctCategory });
          updatedCount++;
        }
      });
      
      if (updatedCount > 0) {
        await batch.commit();
        alert(`Successfully synced ${updatedCount} classes to their correct categories!`);
      } else {
        alert('All classes are already in their correct categories.');
      }
    } catch (error: any) {
      console.error("Sync error:", error);
      alert('Error syncing categories: ' + error.message);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleUpdateSubjectMentor = async (subjectName: string, mentorName: string) => {
    setIsSeeding(true);
    try {
      // Save to a centralized subject_mentors collection for robustness
      // Use a safe ID (replace slashes just in case)
      const safeId = subjectName.replace(/\//g, '_');
      await setDoc(doc(db, 'subject_mentors', safeId), { 
        subjectName, 
        mentorName,
        updatedAt: Date.now() 
      });

      // Also update existing classes in a batch for backward compatibility/data integrity
      const batch = writeBatch(db);
      const target = subjectName.trim().toLowerCase();
      const subjectClasses = classes.filter(c => {
        const normalized = c.subject?.trim().toLowerCase();
        if (normalized === target) return true;
        if ((target === 'muslim law' || target === 'muslim laws') && 
            (normalized === 'muslim law' || normalized === 'muslim laws')) return true;
        return false;
      });
      
      if (subjectClasses.length > 0) {
        subjectClasses.forEach(cls => {
          batch.update(doc(db, 'classes', cls.id!), { mentor: mentorName });
        });
        await batch.commit();
      }

      setEditingMentorSubject(null);
      setNewMentorName('');
    } catch (error: any) {
      console.error('Error updating mentor:', error);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleSeedData = async () => {
    if (!confirm('This will add all initial classes from the data file to your database. Duplicate classes might be created if they already exist. Continue?')) return;
    setIsSeeding(true);
    try {
      const batch = writeBatch(db);
      INITIAL_CLASSES.forEach((cls) => {
        const newDocRef = doc(collection(db, 'classes'));
        batch.set(newDocRef, { ...cls, createdAt: Date.now() });
      });
      await batch.commit();
      alert('Successfully seeded initial data!');
    } catch (error: any) {
      console.error("Seed error:", error);
      alert('Error seeding data: ' + error.message);
    } finally {
      setIsSeeding(false);
    }
  };
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  const [formData, setFormData] = useState<Partial<ClassData>>({
    category: '',
    subject: '',
    class_no: 1,
    date: new Date().toISOString().split('T')[0],
    topic: '',
    video_link: '',
    mentor: '',
    status: 'Completed'
  });

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        const isAdmin = u.email === 'mohsinhossain995@gmail.com' || u.email === 'mhmohsin348@gmail.com';
        setRole(isAdmin ? 'admin' : 'student');
        fetchUserProgress(u.uid);
      }
    });

    const q = query(collection(db, 'classes'));
    const unsubClasses = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClassData));
      setClasses(data);
      setLoading(false);
    });

    const unsubMentors = onSnapshot(collection(db, 'subject_mentors'), (snapshot) => {
      const mentors: Record<string, string> = {};
      snapshot.docs.forEach(doc => {
        mentors[doc.id] = doc.data().mentorName;
      });
      setSubjectMentors(mentors);
    });

    return () => { unsubAuth(); unsubClasses(); unsubMentors(); };
  }, []);

  const fetchUserProgress = async (uid: string) => {
    const progressDoc = await getDoc(doc(db, 'user_progress', uid));
    if (progressDoc.exists()) {
      const data = progressDoc.data();
      setUserProgress(data.completedClassIds || []);
      setCompletionDates(data.completionDates || {});
    }
  };

  const autoFillClassInfo = (category: string, subject: string) => {
    if (!category || !subject) return { class_no: 1, mentor: '' };
    
    // Count existing classes for this subject in this category
    // Use more robust filtering
    const subjectClasses = classes.filter(c => {
      const cCat = (c.category || '').trim().toLowerCase();
      const cSub = (c.subject || '').trim().toLowerCase();
      const targetCat = category.trim().toLowerCase();
      const targetSub = subject.trim().toLowerCase();
      return cCat === targetCat && cSub === targetSub;
    });
    
    // Use Math.max to find the highest class number and increment it
    const maxSerial = subjectClasses.reduce((max, c) => {
      const num = typeof c.class_no === 'number' ? c.class_no : parseInt(String(c.class_no));
      return !isNaN(num) ? Math.max(max, num) : max;
    }, 0);
    
    const nextSerial = maxSerial + 1;
    
    // Get mentor from centralized state
    const safeId = subject.trim().replace(/\//g, '_');
    const mentor = subjectMentors[safeId] || '';
    
    return { class_no: nextSerial, mentor };
  };

  // Auto-fill logic for new classes
  useEffect(() => {
    if (!isEditing && showAddModal && formData.category && formData.subject) {
      const { class_no, mentor } = autoFillClassInfo(formData.category, formData.subject);
      
      // Only update if values are different to avoid unnecessary re-renders
      if (formData.class_no !== class_no || (mentor && formData.mentor !== mentor)) {
        setFormData(prev => ({
          ...prev,
          class_no: class_no,
          mentor: mentor || prev.mentor
        }));
      }
    }
  }, [formData.category, formData.subject, isEditing, showAddModal, classes, subjectMentors]);

  const toggleClassProgress = async (classId: string) => {
    if (!user) return;
    const isCompleted = userProgress.includes(classId);
    
    const newProgress = isCompleted 
      ? userProgress.filter(id => id !== classId)
      : [...userProgress, classId];
    
    const newCompletionDates = { ...completionDates };
    if (isCompleted) {
      delete newCompletionDates[classId];
    } else {
      newCompletionDates[classId] = new Date().toISOString();
    }
    
    setUserProgress(newProgress);
    setCompletionDates(newCompletionDates);
    
    await setDoc(doc(db, 'user_progress', user.uid), { 
      completedClassIds: newProgress,
      completionDates: newCompletionDates
    }, { merge: true });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');
    const email = (e.target as any).email.value;
    const password = (e.target as any).password.value;
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setLoginError(err.message || 'Login failed');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const categoriesData = useMemo(() => {
    const groups: Record<string, { total: number, finished: number, subjects: string[] }> = {};
    
    // Initialize with all categories from the map to ensure they always show up
    Object.keys(CATEGORIES_MAP).forEach(cat => {
      groups[cat] = { total: 0, finished: 0, subjects: [...CATEGORIES_MAP[cat]] };
    });

    classes.forEach(cls => {
      // Derive category from subject map if possible, fallback to stored category
      let cat = cls.category;
      const normalizedSubject = cls.subject?.trim();
      
      for (const [categoryName, subjects] of Object.entries(CATEGORIES_MAP)) {
        if (subjects.includes(normalizedSubject) || (categoryName === 'Special Laws' && normalizedSubject?.startsWith('Special Laws'))) {
          cat = categoryName;
          break;
        }
      }
      
      if (!cat) cat = 'Uncategorized';
      
      if (!groups[cat]) groups[cat] = { total: 0, finished: 0, subjects: [] };
      groups[cat].total += 1;
      if (userProgress.includes(cls.id!)) groups[cat].finished += 1;
      if (normalizedSubject && !groups[cat].subjects.includes(normalizedSubject)) {
        // Only add if it's not already there (to avoid duplicates with different spacing)
        if (!groups[cat].subjects.some(s => s.trim() === normalizedSubject)) {
          groups[cat].subjects.push(normalizedSubject);
        }
      }
    });
    return Object.entries(groups).map(([name, stats]) => ({ name, ...stats }));
  }, [classes, userProgress]);

  const subjectsData = useMemo(() => {
    if (!selectedCategory) return [];
    const groups: Record<string, { total: number, finished: number, mentor: string }> = {};
    
    // Initialize with subjects from the map to ensure they show up even with 0 classes
    if (CATEGORIES_MAP[selectedCategory]) {
      CATEGORIES_MAP[selectedCategory].forEach(sub => {
        groups[sub] = { total: 0, finished: 0, mentor: '' };
      });
    }

    classes.filter(cls => {
      const normalizedSubject = cls.subject?.trim();
      // Check if this class belongs to the selected category
      if (cls.category === selectedCategory) return true;
      if (CATEGORIES_MAP[selectedCategory]?.some(s => s.trim() === normalizedSubject)) return true;
      if (selectedCategory === 'Special Laws' && normalizedSubject?.startsWith('Special Laws')) return true;
      return false;
    }).forEach(cls => {
      let normalizedSubject = cls.subject?.trim();
      // Normalize Muslim Law/Laws to match the map if needed
      if (normalizedSubject === 'Muslim Laws') normalizedSubject = 'Muslim Law';
      
      if (!groups[normalizedSubject]) groups[normalizedSubject] = { total: 0, finished: 0, mentor: '' };
      groups[normalizedSubject].total += 1;
      if (userProgress.includes(cls.id!)) groups[normalizedSubject].finished += 1;
      
      // Prioritize centralized mentor info, fallback to class data
      const safeId = normalizedSubject.replace(/\//g, '_');
      const centralizedMentor = subjectMentors[safeId];
      if (centralizedMentor) {
        groups[normalizedSubject].mentor = centralizedMentor;
      } else if (cls.mentor && !groups[normalizedSubject].mentor) {
        groups[normalizedSubject].mentor = cls.mentor;
      }
    });

    // Final pass to ensure subjects from map also get their mentors from centralized state
    Object.keys(groups).forEach(subName => {
      const safeId = subName.replace(/\//g, '_');
      if (subjectMentors[safeId]) {
        groups[subName].mentor = subjectMentors[safeId];
      }
    });

    return Object.entries(groups).map(([name, stats]) => ({ name, ...stats }));
  }, [classes, userProgress, selectedCategory, subjectMentors]);

  const allSubjectsData = useMemo(() => {
    const groups: Record<string, { total: number, finished: number, mentor: string }> = {};
    
    // Initialize with all subjects from the map
    Object.values(CATEGORIES_MAP).flat().forEach(sub => {
      groups[sub] = { total: 0, finished: 0, mentor: '' };
    });

    classes.forEach(cls => {
      let normalizedSubject = cls.subject?.trim();
      if (!normalizedSubject) return;
      if (normalizedSubject === 'Muslim Laws') normalizedSubject = 'Muslim Law';
      
      if (!groups[normalizedSubject]) groups[normalizedSubject] = { total: 0, finished: 0, mentor: '' };
      groups[normalizedSubject].total += 1;
      if (userProgress.includes(cls.id!)) groups[normalizedSubject].finished += 1;
      
      const safeId = normalizedSubject.replace(/\//g, '_');
      const centralizedMentor = subjectMentors[safeId];
      if (centralizedMentor) {
        groups[normalizedSubject].mentor = centralizedMentor;
      } else if (cls.mentor && !groups[normalizedSubject].mentor) {
        groups[normalizedSubject].mentor = cls.mentor;
      }
    });

    Object.keys(groups).forEach(subName => {
      const safeId = subName.replace(/\//g, '_');
      if (subjectMentors[safeId]) {
        groups[subName].mentor = subjectMentors[safeId];
      }
    });

    return Object.entries(groups)
      .filter(([_, stats]) => stats.total > 0)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => {
        const progressA = a.finished / a.total;
        const progressB = b.finished / b.total;
        if (progressB !== progressA) {
          return progressB - progressA;
        }
        return a.name.localeCompare(b.name);
      });
  }, [classes, userProgress, subjectMentors]);

  const filteredClasses = useMemo(() => {
    return classes
      .filter(cls => {
        const normalizedSubject = cls.subject?.trim();
        // Category check (resilient)
        const isInCategory = !selectedCategory || 
          cls.category === selectedCategory || 
          CATEGORIES_MAP[selectedCategory]?.some(s => s.trim() === normalizedSubject) ||
          (selectedCategory === 'Special Laws' && normalizedSubject?.startsWith('Special Laws'));
          
        const matchesSubject = !selectedSubject || 
          normalizedSubject === selectedSubject.trim() ||
          (selectedSubject.trim() === 'Muslim Law' && normalizedSubject === 'Muslim Laws') ||
          (selectedSubject.trim() === 'Muslim Laws' && normalizedSubject === 'Muslim Law');

        const topic = cls.topic || '';
        const matchesSearch = topic.toLowerCase().includes(searchTerm.toLowerCase());
        return isInCategory && matchesSubject && matchesSearch;
      })
      .sort((a, b) => a.class_no - b.class_no);
  }, [classes, selectedCategory, selectedSubject, searchTerm]);

  const completedClassesList = useMemo(() => {
    return classes
      .filter(cls => userProgress.includes(cls.id!))
      .sort((a, b) => a.class_no - b.class_no);
  }, [classes, userProgress]);

  const overallProgress = useMemo(() => {
    if (classes.length === 0) return 0;
    return Math.round((userProgress.length / classes.length) * 100);
  }, [classes, userProgress]);

  const masteryRank = useMemo(() => {
    if (overallProgress < 20) return { title: 'Beginner', color: 'text-slate-400', bg: 'bg-slate-400/10' };
    if (overallProgress < 50) return { title: 'Intermediate', color: 'text-blue-400', bg: 'bg-blue-400/10' };
    if (overallProgress < 80) return { title: 'Advanced', color: 'text-indigo-400', bg: 'bg-indigo-400/10' };
    return { title: 'Expert', color: 'text-emerald-400', bg: 'bg-emerald-400/10' };
  }, [overallProgress]);

  const categoryChartData = useMemo(() => {
    return categoriesData.map(cat => ({
      subject: cat.name,
      A: Math.round((cat.finished / cat.total) * 100),
      fullMark: 100,
    }));
  }, [categoriesData]);

  const completionHistory = useMemo(() => {
    return classes
      .filter(cls => userProgress.includes(cls.id!))
      .map(cls => ({
        ...cls,
        completedAt: completionDates[cls.id!] || 'N/A'
      }))
      .sort((a, b) => {
        if (a.completedAt === 'N/A') return 1;
        if (b.completedAt === 'N/A') return -1;
        return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
      });
  }, [classes, userProgress, completionDates]);

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    
    const day = date.getDate();
    const month = date.toLocaleString('en-US', { month: 'long' });
    const year = date.getFullYear();
    
    const getOrdinalSuffix = (d: number) => {
      if (d > 3 && d < 21) return 'th';
      switch (d % 10) {
        case 1: return "st";
        case 2: return "nd";
        case 3: return "rd";
        default: return "th";
      }
    };
    
    return `${month} ${day}${getOrdinalSuffix(day)}, ${year}`;
  };

  const goToDashboard = () => {
    setSelectedCategory(null);
    setSelectedSubject(null);
    setActiveTab('dashboard');
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#080c14] text-slate-100">
        <div className="max-w-md w-full glass rounded-[2.5rem] shadow-2xl p-10 border border-white/5 bg-slate-900/40">
          <div className="text-center mb-10">
            <div className="relative w-32 h-32 mx-auto mb-8">
              <div className="absolute -inset-4 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-[2.5rem] blur-2xl opacity-20 animate-pulse"></div>
              <div className="relative bg-gradient-to-br from-indigo-500 to-indigo-700 w-full h-full rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-indigo-600/40 border border-white/10">
                <span className="text-6xl font-black text-white drop-shadow-2xl">M</span>
              </div>
            </div>
            <h1 className="text-5xl font-black tracking-tighter bg-gradient-to-r from-white via-indigo-200 to-slate-400 bg-clip-text text-transparent uppercase">Mohsin</h1>
            <p className="text-indigo-400/80 mt-3 font-black uppercase tracking-[0.4em] text-[10px]">Learning Management Portal</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-indigo-400/60 uppercase ml-1 tracking-widest">Administrator Email</label>
              <input name="email" type="email" required className="w-full px-5 py-4 rounded-2xl bg-slate-800/50 border border-white/5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-white font-medium" placeholder="Write Your Email" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-indigo-400/60 uppercase ml-1 tracking-widest">Secret Password</label>
              <input name="password" type="password" required className="w-full px-5 py-4 rounded-2xl bg-slate-800/50 border border-white/5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-white font-medium" placeholder="Write Your Password" />
            </div>
            {loginError && <div className="text-rose-400 text-sm font-bold bg-rose-500/10 p-4 rounded-2xl border border-rose-500/20 flex items-center gap-3"><XCircle size={18}/> {loginError}</div>}
            <button disabled={isLoggingIn} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl transition-all shadow-xl shadow-indigo-600/30 active:scale-[0.98] disabled:opacity-50 mt-4 h-16 text-lg">
              {isLoggingIn ? <Loader2 className="animate-spin mx-auto" /> : 'Enter Dashboard'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080c14] text-slate-200 selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Compact Responsive Navbar */}
      <nav className="sticky top-0 z-50 glass border-b border-white/5 px-4 md:px-8 py-2 md:py-4 flex items-center justify-between bg-slate-900/60">
        <div className="flex items-center gap-3 md:gap-4 cursor-pointer group" onClick={goToDashboard}>
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl md:rounded-2xl blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative bg-slate-900 p-2 md:p-3 rounded-xl md:rounded-2xl border border-white/10 shadow-2xl flex items-center justify-center">
              <span className="text-xl md:text-3xl font-black bg-gradient-to-br from-indigo-400 to-purple-500 bg-clip-text text-transparent leading-none">M</span>
            </div>
          </div>
          <div className="flex flex-col -space-y-1">
            <span className="text-xl md:text-3xl font-black tracking-tighter text-white group-hover:text-indigo-400 transition-colors">MOHSIN</span>
            <span className="text-[8px] md:text-[10px] font-black text-indigo-500/60 uppercase tracking-[0.3em] ml-0.5">Management</span>
          </div>
        </div>
        
        <div className="flex items-center gap-1 bg-slate-800/50 p-1 rounded-xl border border-white/5">
          <button onClick={goToDashboard} className={`flex items-center gap-1.5 px-3 md:px-6 py-2 rounded-lg text-[10px] md:text-sm font-black transition-all ${activeTab === 'dashboard' || activeTab === 'subject_view' || activeTab === 'completed_view' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:text-white'}`}>
            <LayoutDashboard size={14} className="md:w-[18px] md:h-[18px]" /> Dashboard
          </button>
          <button onClick={() => setActiveTab('analysis')} className={`flex items-center gap-1.5 px-3 md:px-6 py-2 rounded-lg text-[10px] md:text-sm font-black transition-all ${activeTab === 'analysis' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:text-white'}`}>
            <BarChart3 size={14} className="md:w-[18px] md:h-[18px]" /> Analysis
          </button>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <button onClick={() => signOut(auth)} className="p-2 md:p-3 bg-slate-800/80 rounded-lg md:rounded-2xl hover:bg-rose-500/20 hover:text-rose-400 transition-all border border-white/5">
            <LogOut size={16} className="md:w-5 md:h-5" />
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-4 md:p-8">
        {loading && <div className="flex flex-col items-center justify-center py-40 gap-4"><Loader2 className="animate-spin text-indigo-500" size={60} /><p className="font-black text-indigo-400/50 uppercase tracking-widest text-xs">Syncing Database...</p></div>}

        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && !selectedCategory && !selectedSubject && !loading && (
          <div className="space-y-10 animate-in fade-in duration-700">
            {/* Stats Cards Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="glass p-5 rounded-2xl border border-white/5 bg-gradient-to-br from-slate-900/40 to-indigo-900/10 flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400"><Layers size={24}/></div>
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Categories</p>
                  <p className="text-2xl font-black text-white mt-0.5">{categoriesData.length}</p>
                </div>
              </div>
              <div className="glass p-5 rounded-2xl border border-white/5 bg-gradient-to-br from-slate-900/40 to-purple-900/10 flex items-center gap-4">
                <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center text-purple-400"><BookOpen size={24}/></div>
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Subjects</p>
                  <p className="text-2xl font-black text-white mt-0.5">{subjectsData.length || Object.keys(CATEGORIES_MAP).reduce((acc, cat) => acc + CATEGORIES_MAP[cat].length, 0)}</p>
                </div>
              </div>
              <div className="glass p-5 rounded-2xl border border-white/5 bg-gradient-to-br from-slate-900/40 to-blue-900/10 flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400"><Play size={24}/></div>
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Classes</p>
                  <p className="text-2xl font-black text-white mt-0.5">{classes.length}</p>
                </div>
              </div>
              <div 
                onClick={() => setActiveTab('completed_view')}
                className="glass p-5 rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/40 to-emerald-900/20 flex items-center gap-4 cursor-pointer hover:bg-slate-800/80 hover:shadow-xl hover:shadow-emerald-500/5 transition-all group"
              >
                <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-all"><CheckSquare size={24}/></div>
                <div className="flex-1">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Completed</p>
                  <p className="text-2xl font-black text-white mt-0.5">{userProgress.length}</p>
                </div>
                <ChevronRight size={16} className="text-slate-600 group-hover:text-emerald-400 transition-all" />
              </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <h2 className="text-3xl font-black text-white tracking-tight">Resource Library</h2>
                <p className="text-slate-500 mt-1 font-bold uppercase tracking-widest text-[9px]">Explore your professional study vault by category</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {/* Category Filter */}
                <select 
                  value={selectedCategory || ''} 
                  onChange={e => { 
                    const val = e.target.value || null;
                    setSelectedCategory(val); 
                    setSelectedSubject(null); 
                    if (val) setActiveTab('dashboard');
                  }}
                  className="bg-slate-800/50 border border-white/5 text-white text-xs font-bold px-4 py-3 rounded-xl outline-none focus:border-indigo-500 transition-all h-[52px] min-w-[160px] appearance-none cursor-pointer"
                >
                  <option value="">All Categories</option>
                  {Object.keys(CATEGORIES_MAP).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>

                {/* Subject Filter */}
                <select 
                  value={selectedSubject || ''} 
                  onChange={e => {
                    const val = e.target.value || null;
                    setSelectedSubject(val);
                    if (val) setActiveTab('subject_view');
                  }}
                  disabled={!selectedCategory}
                  className="bg-slate-800/50 border border-white/5 text-white text-xs font-bold px-4 py-3 rounded-xl outline-none focus:border-indigo-500 transition-all disabled:opacity-50 h-[52px] min-w-[160px] appearance-none cursor-pointer"
                >
                  <option value="">All Subjects</option>
                  {selectedCategory && CATEGORIES_MAP[selectedCategory]?.map(sub => <option key={sub} value={sub}>{sub}</option>)}
                </select>

                {role === 'admin' && (
                  <button onClick={() => { setFormData({ category: '', subject: '', class_no: 1, date: new Date().toISOString().split('T')[0], topic: '', video_link: '', status: 'Completed' }); setIsEditing(null); setShowAddModal(true); }} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3.5 rounded-xl font-black flex items-center gap-3 shadow-xl shadow-indigo-600/20 transition-all active:scale-95 group text-sm h-[52px]">
                    <Plus size={18} className="group-hover:rotate-90 transition-transform" /> Add Class
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {categoriesData.map((cat, i) => (
                <div 
                  key={i} 
                  onClick={() => { setSelectedCategory(cat.name); }}
                  className="group relative glass p-6 rounded-3xl cursor-pointer hover:bg-slate-800/60 hover:border-indigo-500/40 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-300 border border-white/5 flex flex-col justify-between h-48 overflow-hidden"
                >
                  <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/15 transition-all"></div>
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-all shadow-md">
                        <Layers size={20} />
                      </div>
                      <div className="text-[10px] font-black text-slate-500 group-hover:text-indigo-400 transition-colors uppercase tracking-widest">
                        {cat.subjects.length} Subjects
                      </div>
                    </div>
                    <h3 className="text-lg font-black text-white group-hover:text-indigo-300 transition-colors leading-tight line-clamp-2">{cat.name}</h3>
                  </div>
                  <div className="space-y-2 mt-auto">
                    <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-slate-500">
                      <span>Done</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-indigo-400 font-bold">{Math.round((cat.finished / cat.total) * 100)}%</span>
                        <span className="text-slate-500">({cat.finished}/{cat.total})</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-slate-900/50 rounded-full overflow-hidden border border-white/5">
                      <div 
                        className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-1000 ease-out rounded-full" 
                        style={{ width: `${(cat.finished / cat.total) * 100}%` }} 
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SUBJECTS LIST IN CATEGORY */}
        {activeTab === 'dashboard' && selectedCategory && !selectedSubject && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-10 duration-500">
            <div className="flex items-center gap-6">
              <button onClick={() => setSelectedCategory(null)} className="p-4 rounded-2xl bg-slate-800/50 hover:bg-indigo-600 text-white transition-all shadow-lg border border-white/5">
                <ArrowLeft size={24} />
              </button>
              <div>
                <h2 className="text-3xl font-black text-white tracking-tight">{selectedCategory}</h2>
                <p className="text-indigo-400/60 font-bold uppercase tracking-widest text-[10px]">Select a subject to view classes</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {subjectsData.map((sub, i) => (
                <div 
                  key={i} 
                  onClick={() => { setSelectedSubject(sub.name); setActiveTab('subject_view'); }}
                  className="group relative glass p-6 rounded-3xl cursor-pointer hover:bg-slate-800/60 hover:border-indigo-500/40 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-300 border border-white/5 flex flex-col justify-between h-48 overflow-hidden"
                >
                  <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/15 transition-all"></div>
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-all shadow-md">
                        <BookOpen size={20} />
                      </div>
                      <div className="text-[10px] font-black text-slate-500 group-hover:text-indigo-400 transition-colors uppercase tracking-widest">
                        {sub.total} Classes
                      </div>
                    </div>
                    <h3 className="text-lg font-black text-white group-hover:text-indigo-300 transition-colors leading-tight line-clamp-2">{sub.name}</h3>
                    
                    {/* MENTOR DISPLAY & EDIT */}
                    <div className="mt-2 flex items-center justify-between group/mentor">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                          <UserIcon size={10} />
                        </div>
                        {editingMentorSubject === sub.name ? (
                          <div className="flex items-center gap-1">
                            <input 
                              autoFocus
                              type="text"
                              value={newMentorName}
                              onChange={e => setNewMentorName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleUpdateSubjectMentor(sub.name, newMentorName);
                                if (e.key === 'Escape') setEditingMentorSubject(null);
                              }}
                              className="bg-slate-950 border border-indigo-500/50 rounded px-2 py-0.5 text-[10px] text-white outline-none w-24"
                            />
                            <button 
                              disabled={isSeeding}
                              onClick={(e) => { e.stopPropagation(); handleUpdateSubjectMentor(sub.name, newMentorName); }}
                              className="p-2 text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors disabled:opacity-50"
                            >
                              {isSeeding && editingMentorSubject === sub.name ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                            </button>
                            <button 
                              disabled={isSeeding}
                              onClick={(e) => { e.stopPropagation(); setEditingMentorSubject(null); }}
                              className="p-2 text-rose-400 hover:bg-rose-500/10 rounded transition-colors disabled:opacity-50"
                            >
                              <XCircle size={12} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400 italic">
                            {sub.mentor || 'No Mentor Assigned'}
                          </span>
                        )}
                      </div>
                      {role === 'admin' && editingMentorSubject !== sub.name && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingMentorSubject(sub.name);
                            setNewMentorName(sub.mentor || '');
                          }}
                          className="opacity-0 group-hover/mentor:opacity-100 p-1.5 text-slate-500 hover:text-indigo-400 transition-all"
                        >
                          <Edit size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2 mt-auto">
                    <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-slate-500">
                      <span>Done</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-indigo-400 font-bold">{Math.round((sub.finished / sub.total) * 100)}%</span>
                        <span className="text-slate-500">({sub.finished}/{sub.total})</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-slate-900/50 rounded-full overflow-hidden border border-white/5">
                      <div 
                        className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-1000 ease-out rounded-full" 
                        style={{ width: `${(sub.finished / sub.total) * 100}%` }} 
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SUBJECT VIEW */}
        {activeTab === 'subject_view' && selectedSubject && (
           <div className="space-y-8 animate-in fade-in slide-in-from-right-10 duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                <button onClick={() => { setSelectedSubject(null); setActiveTab('dashboard'); }} className="p-4 rounded-2xl bg-slate-800/50 hover:bg-indigo-600 text-white transition-all shadow-lg border border-white/5">
                  <ArrowLeft size={24} />
                </button>
                <div>
                  <h2 className="text-3xl font-black text-white tracking-tight">{selectedSubject}</h2>
                  <p className="text-indigo-400/60 font-bold uppercase tracking-widest text-[10px]">Archive of all recorded sessions</p>
                </div>
              </div>
              
              <div className="relative group flex-1 max-w-md">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" size={20}/>
                <input 
                  type="text" 
                  placeholder="Filter by topic..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-16 pr-6 py-4.5 rounded-2xl bg-slate-800/30 border border-white/5 focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-sm font-bold text-white placeholder:text-slate-600 h-14" 
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:gap-4">
              {filteredClasses.map((cls) => (
                <div key={cls.id} className="flex flex-col md:flex-row md:items-center justify-between glass p-3 md:p-4 rounded-2xl group hover:border-indigo-500/50 transition-all border border-white/5 bg-slate-900/20">
                  <div className="flex items-center gap-4 flex-1">
                    <div className={`w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-xl flex items-center justify-center font-black text-base border ${userProgress.includes(cls.id!) ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-900 text-slate-500 border-white/5'}`}>
                      {cls.class_no}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-sm md:text-base text-white group-hover:text-indigo-400 transition-colors leading-tight truncate">
                        {cls.topic === 'Null' ? <span className="text-slate-600 italic font-medium">Topic Not Defined</span> : cls.topic}
                      </h4>
                      <div className="flex flex-wrap items-center gap-3 text-[9px] md:text-[10px] text-slate-500 mt-1.5 font-bold uppercase tracking-widest">
                        <span className="flex items-center gap-1.5 bg-slate-800/80 px-3 py-1 rounded-lg border border-white/5"><Calendar size={12} className="text-indigo-500"/> {formatDate(cls.date)}</span>
                        {(() => {
                          const safeId = cls.subject?.trim().replace(/\//g, '_');
                          const mentor = (safeId && subjectMentors[safeId]) || cls.mentor;
                          return mentor ? (
                            <span className="flex items-center gap-1.5 bg-slate-800/80 px-3 py-1 rounded-lg border border-white/5"><UserIcon size={12} className="text-indigo-500"/> {mentor}</span>
                          ) : null;
                        })()}
                        {userProgress.includes(cls.id!) && <span className="text-emerald-500 flex items-center gap-1 bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/20"><CheckCircle2 size={12}/> Finished</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-4 md:mt-0 ml-auto md:ml-0">
                    <button 
                      onClick={() => toggleClassProgress(cls.id!)}
                      className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[9px] font-black transition-all border tracking-widest uppercase ${userProgress.includes(cls.id!) ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-500/10' : 'bg-slate-800 text-slate-400 border-white/10 hover:border-indigo-500 hover:text-white hover:bg-slate-700'}`}
                    >
                      {userProgress.includes(cls.id!) ? <CheckCircle2 size={14}/> : null}
                      {userProgress.includes(cls.id!) ? 'Watched' : 'Mark Watch'}
                    </button>
                    <a href={cls.video_link} target="_blank" rel="noreferrer" className={`p-3 rounded-xl bg-indigo-600 text-white shadow-xl shadow-indigo-600/20 hover:scale-105 active:scale-95 transition-all group/play ${!cls.video_link ? 'opacity-20 grayscale pointer-events-none' : ''}`}>
                      <Play size={18} fill="currentColor" />
                    </a>
                    {role === 'admin' && (
                      <div className="flex gap-1 ml-1">
                        <button onClick={() => { 
                          setFormData({
                            ...cls,
                            mentor: cls.mentor || '',
                            video_link: cls.video_link || '',
                            topic: cls.topic || '',
                            category: cls.category || '',
                            subject: cls.subject || '',
                            status: cls.status || 'Completed'
                          }); 
                          setIsEditing(cls.id!); 
                          setShowAddModal(true); 
                        }} className="p-2 text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors border border-transparent hover:border-indigo-500/20"><Edit size={16}/></button>
                        <button onClick={async () => { if(confirm('Erase this record from history?')) await deleteDoc(doc(db, 'classes', cls.id!)); }} className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors border border-transparent hover:border-rose-500/20"><Trash size={16}/></button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* COMPACT WATCH HISTORY VIEW */}
        {activeTab === 'completed_view' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-10 duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                <button onClick={goToDashboard} className="p-4 rounded-2xl bg-slate-800/50 hover:bg-indigo-600 text-white transition-all shadow-lg border border-white/5">
                  <ArrowLeft size={24} />
                </button>
                <div>
                  <h2 className="text-3xl font-black text-white tracking-tight">Watch History</h2>
                  <p className="text-emerald-400/60 font-bold uppercase tracking-widest text-[10px]">Your personal collection of finished modules</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:gap-4">
              {completedClassesList.map((cls) => (
                <div key={cls.id} className="flex flex-col md:flex-row md:items-center justify-between glass p-3 md:p-4 rounded-2xl group hover:border-emerald-500/50 transition-all border border-white/5 bg-emerald-900/5">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-xl flex items-center justify-center font-black text-base border bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                      {cls.class_no}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[8px] font-black text-emerald-400/60 uppercase tracking-widest mb-0.5 truncate">{cls.subject}</p>
                      <h4 className="font-bold text-sm md:text-base text-white group-hover:text-emerald-400 transition-colors leading-tight truncate">
                        {cls.topic === 'Null' ? <span className="text-slate-600 italic font-medium">Topic Not Defined</span> : cls.topic}
                      </h4>
                      <div className="flex items-center gap-3 text-[9px] md:text-[10px] text-slate-500 mt-1 font-bold uppercase tracking-widest">
                        <span className="flex items-center gap-1 bg-slate-800/80 px-2 py-0.5 rounded-lg border border-white/5"><Calendar size={12} className="text-emerald-500"/> {formatDate(cls.date)}</span>
                        {(() => {
                          const safeId = cls.subject?.trim().replace(/\//g, '_');
                          const mentor = (safeId && subjectMentors[safeId]) || cls.mentor;
                          return mentor ? (
                            <span className="flex items-center gap-1 bg-slate-800/80 px-2 py-0.5 rounded-lg border border-white/5"><UserIcon size={12} className="text-emerald-500"/> {mentor}</span>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-4 md:mt-0 ml-auto md:ml-0">
                    <button onClick={() => toggleClassProgress(cls.id!)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[9px] font-black transition-all border tracking-widest uppercase bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-500/10">
                      <CheckCircle2 size={14}/> Watched
                    </button>
                    <a href={cls.video_link} target="_blank" rel="noreferrer" className="p-3 rounded-xl bg-indigo-600 text-white shadow-xl shadow-indigo-600/20 hover:scale-105 active:scale-95 transition-all group/play">
                      <Play size={18} fill="currentColor" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ANALYSIS TAB */}
        {activeTab === 'analysis' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="flex items-end gap-3">
                <div className="bg-indigo-500/10 p-3 rounded-xl border border-indigo-500/20">
                  <BarChart3 size={24} className="text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tight">Learning Analytics</h2>
                  <p className="text-slate-500 font-bold uppercase tracking-widest text-[8px]">Measuring academic performance</p>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="bg-slate-900/40 px-4 py-2 rounded-xl border border-white/5 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Real-time Sync</span>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Overall Mastery Card */}
              <div className="lg:col-span-4 glass rounded-[2.5rem] p-8 border-indigo-500/20 bg-gradient-to-br from-slate-900/40 via-indigo-900/5 to-slate-950/60 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 rounded-full blur-[100px] -mr-32 -mt-32"></div>
                
                <div className="relative h-full flex flex-col">
                  <div className="flex justify-between items-start mb-8">
                    <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Overall Status</p>
                      <h3 className="text-xl font-black text-white">Curriculum Mastery</h3>
                    </div>
                    <div className={`${masteryRank.bg} ${masteryRank.color} px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/5`}>
                      {masteryRank.title}
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col justify-center items-center py-4">
                    <div className="relative w-48 h-48">
                      <svg className="w-full h-full" viewBox="0 0 100 100">
                        <circle className="text-slate-950/50 stroke-current" strokeWidth="8" fill="transparent" r="40" cx="50" cy="50" />
                        <motion.circle 
                          className="text-indigo-500 stroke-current" 
                          strokeWidth="8" 
                          strokeLinecap="round" 
                          fill="transparent" 
                          r="40" 
                          cx="50" 
                          cy="50" 
                          initial={{ strokeDasharray: "0 251.2" }}
                          animate={{ strokeDasharray: `${(overallProgress / 100) * 251.2} 251.2` }}
                          transition={{ duration: 1.5, ease: "easeOut" }}
                          style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-5xl font-black text-white tracking-tighter">{overallProgress}%</span>
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Complete</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 grid grid-cols-2 gap-4">
                    <div className="bg-slate-950/40 p-4 rounded-2xl border border-white/5">
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Classes</p>
                      <p className="text-xl font-black text-white">{classes.length}</p>
                    </div>
                    <div className="bg-slate-950/40 p-4 rounded-2xl border border-white/5">
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Completed</p>
                      <p className="text-xl font-black text-emerald-400">{userProgress.length}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Category Distribution Radar */}
              <div className="lg:col-span-8 glass rounded-[2.5rem] p-8 border-white/5 bg-slate-900/20 flex flex-col">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-xl font-black text-white">Category Distribution</h3>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Mastery across different domains</p>
                  </div>
                  <div className="bg-slate-800/50 p-2 rounded-lg border border-white/5">
                    <Trophy className="text-amber-400" size={20} />
                  </div>
                </div>

                <div className="flex-1 min-h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={categoryChartData}>
                      <PolarGrid stroke="#1e293b" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 900 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar
                        name="Progress"
                        dataKey="A"
                        stroke="#6366f1"
                        fill="#6366f1"
                        fillOpacity={0.3}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                        itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Detailed Subject Matrix */}
              <div className="lg:col-span-12 glass rounded-[2.5rem] p-8 border-white/5 bg-slate-900/20 flex flex-col">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-xl font-black text-white">Subject Matrix</h3>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Detailed module tracking</p>
                  </div>
                  <List className="text-slate-500" size={20} />
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto pr-2 no-scrollbar max-h-[350px]">
                  {allSubjectsData.map((sub, i) => (
                    <div key={i} className="p-4 bg-slate-950/40 rounded-2xl border border-white/5 hover:border-indigo-500/30 transition-all group">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <h4 className="text-xs font-black text-white group-hover:text-indigo-400 transition-colors line-clamp-1">{sub.name}</h4>
                          <p className="text-[9px] text-slate-500 font-bold mt-1 uppercase tracking-widest">{sub.mentor || 'No Mentor'}</p>
                        </div>
                        <span className="text-[10px] font-black text-indigo-400">{Math.round((sub.finished / sub.total) * 100)}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${(sub.finished / sub.total) * 100}%` }}
                          transition={{ duration: 1, delay: i * 0.1 }}
                          className="h-full bg-indigo-500"
                        />
                      </div>
                      <div className="flex justify-between mt-2">
                        <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">{sub.finished} / {sub.total} Classes</span>
                        {sub.finished === sub.total && <CheckCircle2 size={12} className="text-emerald-500" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Completion History Table */}
            <div className="glass rounded-[2.5rem] p-8 border-white/5 bg-slate-900/20">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-black text-white">Watch History</h3>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Chronological completion log</p>
                </div>
                <History className="text-indigo-400" size={20} />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="pb-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Topic</th>
                      <th className="pb-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Subject</th>
                      <th className="pb-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Completed At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {completionHistory.length > 0 ? (
                      completionHistory.map((cls, i) => (
                        <tr key={i} className="group hover:bg-white/5 transition-colors">
                          <td className="py-4 pr-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 font-black text-xs">
                                {cls.class_no}
                              </div>
                              <span className="text-sm font-bold text-white group-hover:text-indigo-400 transition-colors">{cls.topic}</span>
                            </div>
                          </td>
                          <td className="py-4 pr-4">
                            <span className="text-xs font-medium text-slate-400">{cls.subject}</span>
                          </td>
                          <td className="py-4">
                            <div className="flex items-center gap-2 text-emerald-400">
                              <Calendar size={12} />
                              <span className="text-xs font-bold">
                                {cls.completedAt !== 'N/A' ? formatDate(cls.completedAt) : 'N/A'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-12 text-center">
                          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">No watch history found</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </main>

      {/* MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10 bg-slate-950/90 backdrop-blur-xl overflow-y-auto">
          <div className="glass rounded-[3.5rem] w-full max-w-2xl p-8 md:p-12 shadow-[0_0_100px_rgba(0,0,0,0.5)] animate-in zoom-in-95 duration-300 border-indigo-500/20 my-auto bg-slate-900/90 relative">
            <button onClick={() => setShowAddModal(false)} className="absolute right-8 top-8 text-slate-500 hover:text-rose-500 transition-all hover:rotate-90 duration-300"><XCircle size={36}/></button>
            <div className="mb-10 text-center md:text-left">
              <h3 className="text-4xl font-black text-white tracking-tighter">{isEditing ? 'Update Asset' : 'Inject New Data'}</h3>
              <p className="text-indigo-400/60 font-black uppercase tracking-widest text-[10px] mt-2">Database management interface</p>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                const finalData = { ...formData };
                if (isAddingNewCategory) {
                  finalData.category = newCategoryName;
                }
                if (isAddingNewSubject) {
                  finalData.subject = newSubjectName;
                }

                if (!finalData.category || !finalData.subject) {
                  alert("Please select or enter both Category and Subject.");
                  return;
                }

                if (isEditing) await updateDoc(doc(db, 'classes', isEditing), finalData);
                else await addDoc(collection(db, 'classes'), { ...finalData, createdAt: Date.now() });
                
                setShowAddModal(false);
                setIsAddingNewCategory(false);
                setIsAddingNewSubject(false);
                setNewCategoryName('');
                setNewSubjectName('');
                setSelectedCategory(null);
                setSelectedSubject(null);
              } catch (err: any) { alert("Error: " + err.message); }
            }} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Category</label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-500 transition-colors"><Layers size={20}/></div>
                    {!isAddingNewCategory ? (
                      <select 
                        required 
                        value={formData.category || ''} 
                        onChange={e => {
                          const val = e.target.value;
                          if (val === 'ADD_NEW') {
                            setIsAddingNewCategory(true);
                            setIsAddingNewSubject(true);
                            setFormData({...formData, category: '', subject: '', class_no: 1, mentor: ''});
                          } else {
                            setFormData({...formData, category: val, subject: ''});
                          }
                        }} 
                        className="w-full pl-14 pr-6 py-5 bg-slate-950 rounded-[1.5rem] border border-white/5 focus:border-indigo-500 outline-none transition-all font-bold text-white shadow-inner appearance-none"
                      >
                        <option value="">Select Category</option>
                        {/* Combine hardcoded map with dynamic data from Firestore */}
                        {Array.from(new Set([...Object.keys(CATEGORIES_MAP), ...categoriesData.map(c => c.name)])).sort().map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                        <option value="ADD_NEW" className="text-indigo-400 font-bold">+ Add New Category</option>
                      </select>
                    ) : (
                      <div className="flex gap-2">
                        <input 
                          required
                          type="text"
                          placeholder="Enter New Category Name"
                          value={newCategoryName}
                          onChange={e => setNewCategoryName(e.target.value)}
                          className="w-full pl-14 pr-6 py-5 bg-slate-950 rounded-[1.5rem] border border-indigo-500 outline-none transition-all font-bold text-white shadow-inner"
                        />
                        <button 
                          type="button"
                          onClick={() => { setIsAddingNewCategory(false); setIsAddingNewSubject(false); setNewCategoryName(''); }}
                          className="px-4 bg-slate-800 rounded-2xl text-slate-400 hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Subject</label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-500 transition-colors"><BookOpen size={20}/></div>
                    {!isAddingNewSubject ? (
                      <select 
                        required 
                        value={formData.subject || ''} 
                        onChange={e => {
                          const val = e.target.value;
                          if (val === 'ADD_NEW') {
                            setIsAddingNewSubject(true);
                            setFormData({...formData, subject: '', class_no: 1, mentor: ''});
                          } else {
                            setFormData({
                              ...formData, 
                              subject: val
                            });
                          }
                        }} 
                        className="w-full pl-14 pr-6 py-5 bg-slate-950 rounded-[1.5rem] border border-white/5 focus:border-indigo-500 outline-none transition-all font-bold text-white shadow-inner appearance-none"
                      >
                        <option value="">Select Subject</option>
                        {/* Combine hardcoded map with dynamic data from Firestore for the selected category */}
                        {(() => {
                          const hardcodedSubjects = formData.category ? (CATEGORIES_MAP[formData.category] || []) : [];
                          const dynamicSubjects = classes
                            .filter(c => c.category === formData.category)
                            .map(c => c.subject);
                          const allSubjects = Array.from(new Set([...hardcodedSubjects, ...dynamicSubjects])).sort();
                          
                          return allSubjects.map(sub => {
                            const safeId = sub.trim().replace(/\//g, '_');
                            const mentor = subjectMentors[safeId];
                            return (
                              <option key={sub} value={sub}>
                                {sub} {mentor ? `(${mentor})` : ''}
                              </option>
                            );
                          });
                        })()}
                        <option value="ADD_NEW" className="text-indigo-400 font-bold">+ Add New Subject</option>
                      </select>
                    ) : (
                      <div className="flex gap-2">
                        <input 
                          required
                          type="text"
                          placeholder="Enter New Subject Name"
                          value={newSubjectName}
                          onChange={e => setNewSubjectName(e.target.value)}
                          className="w-full pl-14 pr-6 py-5 bg-slate-950 rounded-[1.5rem] border border-indigo-500 outline-none transition-all font-bold text-white shadow-inner"
                        />
                        <button 
                          type="button"
                          onClick={() => { setIsAddingNewSubject(false); setNewSubjectName(''); }}
                          className="px-4 bg-slate-800 rounded-2xl text-slate-400 hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Serial Number</label>
                  <input required type="number" value={formData.class_no || 1} onChange={e => setFormData({...formData, class_no: parseInt(e.target.value)})} className="w-full p-5 bg-slate-950 rounded-[1.5rem] border border-white/5 focus:border-indigo-500 outline-none transition-all font-bold text-white shadow-inner" />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Publication Date</label>
                  <input required value={formData.date || ''} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full p-5 bg-slate-950 rounded-[1.5rem] border border-white/5 focus:border-indigo-500 outline-none transition-all font-bold text-white shadow-inner" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Module Topic</label>
                  <input required value={formData.topic || ''} onChange={e => setFormData({...formData, topic: e.target.value})} className="w-full p-5 bg-slate-950 rounded-[1.5rem] border border-white/5 focus:border-indigo-500 outline-none transition-all font-bold text-white shadow-inner" placeholder="Detailed topic description..." />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Mentor Name</label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-500 transition-colors"><UserIcon size={20}/></div>
                    <input value={formData.mentor || ''} onChange={e => setFormData({...formData, mentor: e.target.value})} className="w-full pl-14 pr-6 py-5 bg-slate-950 rounded-[1.5rem] border border-white/5 focus:border-indigo-500 outline-none transition-all font-bold text-white shadow-inner" placeholder="Instructor Name" />
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Video Source (URL)</label>
                <div className="relative group">
                  <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-500 transition-colors"><Play size={20}/></div>
                  <input value={formData.video_link || ''} onChange={e => setFormData({...formData, video_link: e.target.value})} className="w-full pl-14 pr-6 py-5 bg-slate-950 rounded-[1.5rem] border border-white/5 focus:border-indigo-500 outline-none transition-all font-bold text-white shadow-inner" placeholder="https://facebook.com/watch/..." />
                </div>
              </div>
              <div className="flex flex-col md:flex-row gap-6 mt-12 pt-6 border-t border-white/5">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-5 font-black text-slate-500 hover:text-white rounded-2xl transition-all border border-transparent hover:border-white/5 h-16 uppercase tracking-widest text-xs">Discard Changes</button>
                <button type="submit" className="flex-1 py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-2xl shadow-indigo-600/40 hover:bg-indigo-500 transition-all active:scale-95 h-16 uppercase tracking-widest text-xs">Commit To Database</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;