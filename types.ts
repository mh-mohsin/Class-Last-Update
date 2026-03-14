
export type StatusType = 'Completed' | 'Not Set' | 'Null';

export interface ClassData {
  id?: string;
  category: string;
  subject: string;
  class_no: number;
  date: string;
  topic: string;
  video_link: string;
  status: StatusType; 
  createdAt: number;
  mentor?: string;
}

export const CATEGORIES_MAP: Record<string, string[]> = {
  'Family Laws': ['Muslim Law'],
  'দেওয়ানী সংক্রান্ত আইন': ['Code Civil Procedure', 'Specific Relief Act'],
  'অপরাধ বিষয়ক আইন': ['Code of Criminal Procedure', 'Penal Code', 'Evidence Act'],
  'সাংবিধানিক আইন': ['Constitutional Law'],
  'সম্পত্তি আইন': ['SAT Act', 'NAT Act'],
  'General Subjects': ['Bangla', 'English Literature', 'Science', 'Math', 'International Affairs'],
  'Special Laws': [
    'Special Laws - দুদক বিধিমালা',
    'Special Laws - দুদক আইন',
    'Special Laws - CLAA 1958',
    'Special Laws - NI Act',
    'Special Laws - সাইবার সুরক্ষা',
    'Special Laws - মানব পাচার',
    'Special Laws - দ্রুত বিচার'
  ]
};

export interface UserProgress {
  completedClassIds: string[];
}

export interface UserProfile {
  uid: string;
  email: string | null;
  role: 'admin' | 'student';
}

export enum SortOption {
  DateAsc = 'date_asc',
  DateDesc = 'date_desc',
  ClassNoAsc = 'class_no_asc',
  ClassNoDesc = 'class_no_desc'
}

export type ActiveTab = 'dashboard' | 'analysis' | 'subject_view' | 'completed_view';
