// Bilingual UI (Bangla default, English optional).
//
// The chosen language is kept in localStorage ("baraka-lang") so it survives
// reloads. Every UI string in the app goes through the dictionary below:
// Bangla mode shows Bangla everywhere; English mode shows English everywhere
// (user-written content such as post titles stays as the author wrote it).

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Lang } from "./lib";

export type { Lang };

const S = {
  /* shell */
  appName: { bn: "বারাকা টিউটরস", en: "Baraka Tutors" },
  appSub: { bn: "Baraka Tutors · রংপুর", en: "Rangpur, Bangladesh" },
  tagline: {
    bn: "রংপুরের গার্ডিয়ান ও টিউটরদের জন্য — টিউশন খুঁজুন, টিউটর খুঁজুন, সরাসরি যোগাযোগ করুন।",
    en: "For guardians and tutors in Rangpur — find tuition, find a tutor, and contact them directly.",
  },
  navBoard: { bn: "বোর্ড", en: "Board" },
  navPost: { bn: "পোস্ট করুন", en: "Post" },
  navFavorites: { bn: "প্রিয়", en: "Favorites" },
  navAdmin: { bn: "অ্যাডমিন", en: "Admin" },
  mainMenu: { bn: "প্রধান মেনু", en: "Main menu" },
  languageLabel: { bn: "ভাষা", en: "Language" },
  footerLine1: {
    bn: "বারাকা টিউটরস (Baraka Tutors) — রংপুরের সব এলাকার টিউশন ও টিউটর এক ঠিকানায়।",
    en: "Baraka Tutors — tuition and tutors from every area of Rangpur, all in one place.",
  },
  footerLine2: {
    bn: "যোগাযোগের আগে বেতন ও সময় ভালোভাবে নিশ্চিত হয়ে নিন।",
    en: "Please confirm the salary and schedule carefully before making contact.",
  },

  /* landing (Tasnim-style home) */
  navHome: { bn: "হোম", en: "Home" },
  navFindTutor: { bn: "টিউটর খুঁজুন", en: "Find a Tutor" },
  navJobs: { bn: "টিউশন জব", en: "Tuition Jobs" },
  navAbout: { bn: "অ্যাবাউট", en: "About" },
  navTrust: { bn: "যাচাই", en: "Trust Check" },
  becomeTutorBtn: { bn: "টিউটর হোন", en: "Become a Tutor" },
  headerLoginBtn: { bn: "লগইন", en: "Login" },
  menuAria: { bn: "মেনু খুলুন", en: "Open menu" },
  heroBadge: { bn: "রংপুরের বিশ্বস্ত টিউশন প্ল্যাটফর্ম", en: "Rangpur's Trusted Tuition Platform" },
  heroTitleStart: { bn: "প্রতিটি শিক্ষার্থীর জন্য", en: "Find the" },
  heroTitleAccent: { bn: "সঠিক টিউটর", en: "Right Tutor" },
  heroTitleEnd: { bn: "খুঁজুন", en: "for Every Student" },
  heroSub: {
    bn: "বেগম রোকেয়া বিশ্ববিদ্যালয়, ঢাকা বিশ্ববিদ্যালয়, মেডিকেলসহ দেশের সেরা প্রতিষ্ঠানের অভিজ্ঞ টিউটর — বাসায় কিংবা অনলাইনে।",
    en: "Experienced tutors from Begum Rokeya University, Dhaka University, medical colleges and other leading institutions — at home or online.",
  },
  heroFindBtn: { bn: "টিউটর খুঁজুন", en: "Find a Tutor" },
  heroJobsBtn: { bn: "টিউশন জব দেখুন", en: "Browse Tuition Jobs" },
  trustStripPosts: { bn: "{n}টি টিউশন পোস্ট", en: "{n} tuition posts" },
  trustStripVerified: { bn: "যাচাইকৃত টিউটর প্রোফাইল", en: "Verified tutor profiles" },
  trustStripArea: { bn: "রংপুরের সব এলাকা", en: "Every area of Rangpur" },
  statTotalPosts: { bn: "মোট পোস্ট", en: "Total posts" },
  uniTitleA: { bn: "শীর্ষ বিশ্ববিদ্যালয়ের", en: "Tutors From" },
  uniTitleB: { bn: "টিউটর", en: "Top Universities" },
  uniSub: {
    bn: "দেশের সেরা বিশ্ববিদ্যালয় ও মেডিকেল কলেজের টিউটরদের খুঁজে নিন। কোনো বিশ্ববিদ্যালয়ে চাপ দিলে সেই প্রতিষ্ঠানের টিউটরদের পোস্ট বোর্ডে দেখা যাবে।",
    en: "Find tutors from the country's top universities and medical colleges. Tap a university to see that institution's tutors on the board.",
  },
  howTitle: { bn: "কীভাবে কাজ করে", en: "How It Works" },
  howSub: { bn: "চারটি সহজ ধাপে সঠিক টিউটর পান।", en: "Get the right tutor in four simple steps." },
  step1Title: { bn: "আপনার প্রয়োজন জানান", en: "Tell Us Your Requirements" },
  step1Desc: { bn: "শ্রেণি, বিষয়, পছন্দের টিউটর, এলাকা ও সময় জানিয়ে পোস্ট দিন।", en: "Post your class, subjects, preferred tutor, area and schedule." },
  step2Title: { bn: "যোগ্য টিউটর পান", en: "Receive Qualified Tutors" },
  step2Desc: { bn: "আপনার প্রয়োজনের সঙ্গে মেলে এমন যাচাইকৃত টিউটরদের দেখুন।", en: "See verified tutors who match your requirements." },
  step3Title: { bn: "ডেমো ক্লাস নিন", en: "Take a Demo Class" },
  step3Desc: { bn: "টিউটরের সঙ্গে কথা বলে পড়ানোর ধরন যাচাই করে নিন।", en: "Talk to the tutor and check their teaching style first." },
  step4Title: { bn: "পড়াশোনা শুরু করুন", en: "Start Learning" },
  step4Desc: { bn: "টিউটর বেছে নিয়ে নিয়মিত বাসায় বা অনলাইনে ক্লাস শুরু করুন।", en: "Choose your tutor and begin regular home or online classes." },
  requestTutorBtn: { bn: "টিউটর অনুরোধ করুন", en: "Request a Tutor" },
  whyTitleA: { bn: "কেন", en: "Why Choose" },
  whyTitleB: { bn: "বারাকা টিউটরস?", en: "Baraka Tutors?" },
  whySub: { bn: "যোগ্য টিউটর খুঁজে পাওয়া সহজ, দ্রুত ও নির্ভরযোগ্য করাই আমাদের কাজ।", en: "We make finding a qualified tutor simple, fast and reliable." },
  why1: { bn: "যাচাইকৃত ও বিশ্বস্ত টিউটর", en: "Verified & trusted tutors" },
  why2: { bn: "১ম শ্রেণি থেকে HSC ও ভর্তি পরীক্ষা পর্যন্ত", en: "Tutors for Class 1 to HSC & admission" },
  why3: { bn: "বাংলা ও ইংরেজি মাধ্যম", en: "Bangla & English medium" },
  why4: { bn: "বাসায় ও অনলাইনে পড়ানো যায়", en: "Home & online tutoring available" },
  why5: { bn: "BUET, DU, মেডিকেল, NSU সহ আরও অনেক প্রতিষ্ঠানের টিউটর", en: "Tutors from BUET, DU, Medical, NSU & more" },
  why6: { bn: "দ্রুত টিউটর মিলিয়ে দেওয়া হয়", en: "Fast tutor matching" },
  ctaBadge: { bn: "শুরু করতে প্রস্তুত?", en: "Ready to Get Started?" },
  ctaTitle: { bn: "আজই টিউটর দরকার?", en: "Need a Tutor Today?" },
  ctaSub: { bn: "আমরা দ্রুত সঠিক টিউটর খুঁজে দিতে সাহায্য করব।", en: "We'll help you find the right one quickly." },
  ctaBtn: { bn: "টিউটর খুঁজুন", en: "Find a Tutor" },

  /* about */
  aboutTitle: { bn: "বারাকা টিউটরস সম্পর্কে", en: "About Baraka Tutors" },
  aboutBody1: {
    bn: "বারাকা টিউটরস রংপুরের একটি টিউশন প্ল্যাটফর্ম। গার্ডিয়ানরা এখানে টিউশনের জন্য টিউটর খুঁজে পোস্ট দেন, আর টিউটররা নিজেদের অফার পোস্ট করেন — দুই পক্ষই এক ঠিকানায় একে অপরকে খুঁজে পান।",
    en: "Baraka Tutors is a tuition platform for Rangpur. Guardians post here when they are looking for a tutor, and tutors post their own offers — both sides find each other in one place.",
  },
  aboutBody2: {
    bn: "টিউটরদের তথ্য অ্যাডমিন যাচাই করেন, আর যাচাই হওয়া টিউটরদের পোস্টে যাচাইকৃত ব্যাজ দেখা যায়। বোর্ডে পোস্ট দেখে আবেদন করা যায়, আর প্রয়োজনে সাইটের চ্যাট থেকে অ্যাডমিনের সঙ্গে যোগাযোগ করা যায়।",
    en: "The admin checks tutors' information, and verified tutors carry a verified badge on their posts. You can browse the board, apply to a post, and reach the admin through the on-site chat when you need help.",
  },
  aboutMission: {
    bn: "রংপুরের প্রতিটি পরিবারের জন্য বিশ্বস্ত টিউটর খোঁজা সহজ, নিরাপদ ও সুসংগঠিত করা।",
    en: "To make finding a trusted tutor in Rangpur simple, safe and organised for every family.",
  },
  aboutMissionLabel: { bn: "আমাদের লক্ষ্য", en: "Our mission" },

  /* trust check */
  trustTitle: { bn: "ট্রাস্ট চেক", en: "Trust Check" },
  trustSub: {
    bn: "যাচাইকৃত টিউটরদের নাম বা মোবাইল নম্বর দিয়ে খুঁজে দেখুন। যাচাইকৃত ব্যাজ মানে অ্যাডমিন টিউটরের তথ্য যাচাই করেছেন।",
    en: "Search verified tutors by name or mobile number. A verified badge means the admin has checked the tutor's information.",
  },
  trustHowTitle: { bn: "যাচাই মানে কী", en: "What verification means" },
  trustHow1: {
    bn: "টিউটর তার প্রতিষ্ঠান ও অভিজ্ঞতার তথ্য দেন।",
    en: "The tutor shares their institution and experience details.",
  },
  trustHow2: {
    bn: "অ্যাডমিন তথ্যগুলো যাচাই করে দেখেন।",
    en: "The admin checks the information.",
  },
  trustHow3: {
    bn: "যাচাই হলে পোস্টে যাচাইকৃত ব্যাজ দেখা যায়।",
    en: "Once verified, the post carries a verified badge.",
  },
  trustSearchPh: { bn: "টিউটরের নাম বা মোবাইল নম্বর লিখুন…", en: "Type a tutor's name or mobile number…" },
  trustSearchBtn: { bn: "খুঁজুন", en: "Search" },
  trustResults: { bn: "{n} জন যাচাইকৃত টিউটর পাওয়া গেছে", en: "{n} verified tutor(s) found" },
  trustNoResult: {
    bn: "এই নাম বা নম্বরে কোনো যাচাইকৃত টিউটর পাওয়া যায়নি।",
    en: "No verified tutor was found for this name or number.",
  },
  trustNoneYet: {
    bn: "এখনো কোনো যাচাইকৃত টিউটর নেই।",
    en: "There are no verified tutors yet.",
  },
  trustDisclaimer: {
    bn: "কোনো রেকর্ড না পাওয়া মানেই যে কেউ নিরাপদ — তা নয়। যোগাযোগের আগে বেতন ও সময় ভালোভাবে নিশ্চিত হয়ে নিন, আর সমস্যা হলে পোস্টে রিপোর্ট করুন।",
    en: "Not finding a record does not confirm that someone is safe. Confirm the salary and schedule carefully before making contact, and report a post if something seems wrong.",
  },
  trustAllVerified: { bn: "সব যাচাইকৃত টিউটর", en: "All verified tutors" },

  /* legal */
  legalPrivacy: { bn: "গোপনীয়তা নীতি", en: "Privacy Policy" },
  legalTerms: { bn: "শর্তাবলি", en: "Terms & Conditions" },
  privacyP1: {
    bn: "বারাকা টিউটরসে আপনি যে তথ্য দেন — নাম, মোবাইল নম্বর, পোস্টের বিবরণ — তা শুধু বোর্ডে পোস্ট দেখানো ও যোগাযোগের কাজে ব্যবহার করা হয়। আপনার তথ্য অন্য কারো কাছে বিক্রি করা হয় না।",
    en: "The information you share on Baraka Tutors — your name, mobile number and post details — is used only to show your post on the board and to let others contact you. Your information is never sold to anyone.",
  },
  privacyP2: {
    bn: "চ্যাটে পাঠানো বার্তা শুধু আপনাকে সাহায্য করার কাজে ব্যবহার করা হয়। নিজের পোস্ট মুছতে বা তথ্য বদলাতে চাইলে সাইটের চ্যাট থেকে অ্যাডমিনের সঙ্গে যোগাযোগ করুন।",
    en: "Messages sent in the chat are used only to help you. If you want your post removed or your details changed, contact the admin through the on-site chat.",
  },
  termsP1: {
    bn: "পোস্টে সত্য তথ্য দিতে হবে। ভুল তথ্য, স্প্যাম বা প্রতারণামূলক পোস্ট অ্যাডমিন যেকোনো সময় মুছে দিতে পারেন। বেতন ও সময় নিয়ে দুই পক্ষ নিজেরা চূড়ান্ত সিদ্ধান্ত নেবেন।",
    en: "Posts must contain truthful information. The admin may remove any post with false information, spam or fraud at any time. The two sides decide the salary and schedule between themselves.",
  },
  termsP2: {
    bn: "টিউটর বা গার্ডিয়ানের সঙ্গে লেনদেনের আগে পরিচয় ও শর্ত ভালোভাবে যাচাই করে নিন। প্ল্যাটফর্মের বাইরে হওয়া লেনদেনের দায় প্ল্যাটফর্ম নেবে না।",
    en: "Before any payment, check the other person's identity and terms carefully. The platform is not responsible for transactions made outside it.",
  },

  /* footer */
  footerQuick: { bn: "দ্রুত লিংক", en: "Quick Links" },
  footerContact: { bn: "যোগাযোগ", en: "Contact" },
  footerLegal: { bn: "আইনি", en: "Legal" },
  footerContactLine1: { bn: "বারাকা টিউটরস, রংপুর, বাংলাদেশ", en: "Baraka Tutors, Rangpur, Bangladesh" },
  footerChatLine: {
    bn: "প্রশ্ন থাকলে এই সাইটের চ্যাট বোতাম থেকে বার্তা পাঠান।",
    en: "Questions? Send a message from the chat button on this site.",
  },
  socialFacebookAria: { bn: "ফেসবুক", en: "Facebook" },
  socialInstagramAria: { bn: "ইনস্টাগ্রাম", en: "Instagram" },
  socialWhatsAppAria: { bn: "হোয়াটসঅ্যাপ", en: "WhatsApp" },
  whatsappAria: { bn: "হোয়াটসঅ্যাপে বার্তা পাঠান", en: "Message on WhatsApp" },
  uniFilterActive: { bn: "{name} — এই প্রতিষ্ঠানের টিউটর দেখানো হচ্ছে", en: "Showing tutors from {name}" },

  /* post card */
  chipGuardian: { bn: "গার্ডিয়ান খুঁজছেন", en: "Guardian looking" },
  chipTutor: { bn: "টিউটর অফার", en: "Tutor offer" },
  chipFeatured: { bn: "ফিচার্ড", en: "Featured" },
  chipVerifiedTutor: { bn: "যাচাইকৃত টিউটর", en: "Verified tutor" },
  wantsMaleChip: { bn: "শিক্ষক চাই", en: "Wants a male teacher" },
  wantsFemaleChip: { bn: "শিক্ষিকা চাই", en: "Wants a female teacher" },
  favAddAria: { bn: "প্রিয় তালিকায় রাখুন", en: "Add to favorites" },
  favRemoveAria: { bn: "প্রিয় তালিকা থেকে সরান", en: "Remove from favorites" },
  daysWeek: { bn: "সপ্তাহে {n} দিন", en: "{n} days a week" },
  callBtn: { bn: "কল", en: "Call" },
  callAria: { bn: "{name}-কে কল করুন", en: "Call {name}" },
  detailsBtn: { bn: "বিস্তারিত", en: "Details" },

  /* board */
  statGuardianPosts: { bn: "গার্ডিয়ানের টিউশন পোস্ট", en: "Guardian tuition posts" },
  statTutorOffers: { bn: "টিউটরের অফার", en: "Tutor offers" },
  statTotalApps: { bn: "মোট আবেদন", en: "Total applications" },
  searchAria: { bn: "খুঁজুন", en: "Search" },
  searchPlaceholder: {
    bn: "বিষয়, এলাকা বা টিউটরের নাম লিখে খুঁজুন…",
    en: "Search by subject, area or tutor name…",
  },
  kindAll: { bn: "সব পোস্ট", en: "All posts" },
  kindGuardian: { bn: "টিউশন চাই (গার্ডিয়ান)", en: "Tuition wanted (Guardian)" },
  kindTutor: { bn: "টিউটর অফার", en: "Tutor offers" },
  postTypeAria: { bn: "পোস্টের ধরন", en: "Post type" },
  filtersBtn: { bn: "ফিল্টার", en: "Filters" },
  fSubject: { bn: "বিষয়", en: "Subject" },
  allSubjects: { bn: "সব বিষয়", en: "All subjects" },
  fClass: { bn: "শ্রেণি", en: "Class" },
  allClasses: { bn: "সব শ্রেণি", en: "All classes" },
  fArea: { bn: "এলাকা (রংপুর)", en: "Area (Rangpur)" },
  areaAria: { bn: "এলাকা", en: "Area" },
  allAreas: { bn: "সব এলাকা", en: "All areas" },
  fMode: { bn: "পড়ানোর ধরন", en: "Teaching mode" },
  anyOpt: { bn: "যেকোনো", en: "Any" },
  modeHomeOpt: { bn: "বাসায় গিয়ে", en: "At home" },
  modeOnlineOpt: { bn: "অনলাইন", en: "Online" },
  modeBothOpt: { bn: "বাসায় + অনলাইন", en: "Home + Online" },
  fMedium: { bn: "মাধ্যম", en: "Medium" },
  fGender: { bn: "শিক্ষক / শিক্ষিকা", en: "Teacher" },
  genderAllOpt: { bn: "সব", en: "All" },
  maleTeacherOpt: { bn: "শিক্ষক", en: "Male teacher" },
  femaleTeacherOpt: { bn: "শিক্ষিকা", en: "Female teacher" },
  anyMedium: { bn: "যেকোনো মাধ্যম", en: "Any medium" },
  mediumBangla: { bn: "বাংলা মাধ্যম", en: "Bangla medium" },
  mediumEnglish: { bn: "ইংরেজি মাধ্যম", en: "English medium" },
  mediumBoth: { bn: "বাংলা + ইংরেজি", en: "Bangla + English" },
  fSort: { bn: "সাজানো", en: "Sort by" },
  sortNewest: { bn: "নতুন আগে", en: "Newest first" },
  sortSalaryHigh: { bn: "বেতন: বেশি থেকে কম", en: "Salary: high to low" },
  sortSalaryLow: { bn: "বেতন: কম থেকে বেশি", en: "Salary: low to high" },
  fMinSalary: { bn: "সর্বনিম্ন বেতন (৳)", en: "Minimum salary (৳)" },
  fMaxSalary: { bn: "সর্বোচ্চ বেতন (৳)", en: "Maximum salary (৳)" },
  eg3000: { bn: "যেমন: 3000", en: "e.g. 3000" },
  eg8000: { bn: "যেমন: 8000", en: "e.g. 8000" },
  clearFilters: { bn: "সব ফিল্টার মুছুন", en: "Clear all filters" },
  saveSearchNameAria: { bn: "সংরক্ষিত খোঁজের নাম", en: "Saved search name" },
  saveSearchPlaceholder: { bn: "এই খোঁজের নাম দিন", en: "Name this search" },
  saveSearchBtn: { bn: "খোঁজ সংরক্ষণ", en: "Save search" },
  errSearchName: { bn: "আগে খোঁজের একটি নাম দিন", en: "Give the search a name first" },
  savedSearches: { bn: "সংরক্ষিত খোঁজ:", en: "Saved searches:" },
  deleteSearchAria: { bn: "{label} মুছুন", en: "Delete {label}" },
  loadingPosts: { bn: "পোস্ট লোড হচ্ছে…", en: "Loading posts…" },
  loadFailTitle: { bn: "পোস্ট লোড করা যায়নি", en: "Could not load posts" },
  loadFailBody: {
    bn: "ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।",
    en: "Check your internet connection and try again.",
  },
  emptyPostsTitle: { bn: "এখনো কোনো পোস্ট নেই", en: "No posts yet" },
  emptyPostsBody: {
    bn: "এই ফিল্টারে কোনো পোস্ট পাওয়া যায়নি। ফিল্টার বদলে দেখুন, অথবা ‘পোস্ট করুন’ ট্যাব থেকে প্রথম পোস্টটি দিন — অনুমোদনের পর তা এখানে দেখা যাবে।",
    en: "No posts match these filters. Try changing the filters, or add the first post from the Post tab — it will appear here once approved.",
  },
  postsFound: { bn: "{n}টি পোস্ট পাওয়া গেছে", en: "{n} posts found" },
  genericFail: { bn: "হয়নি, আবার চেষ্টা করুন", en: "Something went wrong — please try again" },
  saveFail: { bn: "সংরক্ষণ হয়নি", en: "Could not save" },

  /* post detail */
  closeAria: { bn: "বন্ধ করুন", en: "Close" },
  rowArea: { bn: "এলাকা", en: "Area" },
  rowSalary: { bn: "বেতন", en: "Salary" },
  rowMode: { bn: "পড়ানোর ধরন", en: "Teaching mode" },
  rowMedium: { bn: "মাধ্যম", en: "Medium" },
  rowPerWeek: { bn: "সপ্তাহে", en: "Per week" },
  perWeekValue: { bn: "{n} দিন", en: "{n} days" },
  rowStudent: { bn: "শিক্ষার্থী", en: "Student" },
  rowPrefTutor: { bn: "পছন্দের টিউটর", en: "Preferred tutor" },
  rowTutorGender: { bn: "টিউটরের লিঙ্গ", en: "Tutor's gender" },
  rowInstitution: { bn: "প্রতিষ্ঠান", en: "Institution" },
  rowExperience: { bn: "অভিজ্ঞতা", en: "Experience" },
  rowTime: { bn: "সময়", en: "Time" },
  rowPostDate: { bn: "পোস্টের তারিখ", en: "Posted on" },
  rowApplications: { bn: "আবেদন এসেছে", en: "Applications" },
  applicationsValue: { bn: "{n}টি", en: "{n}" },
  detailsHeading: { bn: "বিস্তারিত", en: "Details" },
  callNow: { bn: "কল করুন: {phone}", en: "Call: {phone}" },
  /* Middleman: the public board never shows a full phone or a direct
     call button. The number is masked; contact opens only after the
     application is accepted. */
  maskedContactNote: {
    bn: "নিরাপত্তার জন্য মোবাইল নম্বর আংশিক লুকানো আছে — আবেদন গৃহীত হলে পুরো নম্বর দেখা যাবে।",
    en: "The mobile number is partly hidden for safety — you'll see the full number once your application is accepted.",
  },
  applyToSeeContactBtn: { bn: "যোগাযোগ দেখতে আবেদন করুন", en: "Apply to see contact" },
  contactRevealedLabel: { bn: "যোগাযোগের নম্বর:", en: "Contact number:" },
  guardianAppsTitle: { bn: "আবেদন দেখুন", en: "View applications" },
  guardianAppsBody: {
    bn: "আপনি যে মোবাইল নম্বর দিয়ে এই পোস্টটি দিয়েছেন, সেটি লিখুন — তাহলে এই পোস্টের আবেদনগুলো দেখতে পাবেন।",
    en: "Enter the mobile number you used for this post to see its applications.",
  },
  guardianAppsBtn: { bn: "আবেদন দেখুন", en: "Show applications" },
  guardianAppsWrongPhone: {
    bn: "মোবাইল নম্বরটি এই পোস্টের সঙ্গে মিলছে না — আবার চেষ্টা করুন",
    en: "That mobile number doesn't match this post — please try again",
  },
  guardianAppsEmpty: { bn: "এখনো কোনো আবেদন আসেনি", en: "No applications yet" },
  guardianAppsFail: { bn: "আবেদন দেখা যায়নি", en: "Could not load the applications" },
  favInBtn: { bn: "প্রিয়তে আছে", en: "In favorites" },
  favAddBtn: { bn: "প্রিয় করুন", en: "Add to favorites" },
  applyHeadingGuardian: { bn: "এই টিউশনিতে আবেদন করুন", en: "Apply for this tuition" },
  applyHeadingTutor: { bn: "এই টিউটরের সঙ্গে যোগাযোগ করুন", en: "Contact this tutor" },
  applyDoneMsg: {
    bn: "আপনার আবেদন পৌঁছেছে। পোস্টদাতা শীঘ্রই যোগাযোগ করবেন।",
    en: "Your application has been sent. The poster will contact you soon.",
  },
  yourName: { bn: "আপনার নাম", en: "Your name" },
  namePhAsTutor: { bn: "টিউটর হিসেবে আপনার নাম", en: "Your name, as a tutor" },
  namePhAsGuardian: { bn: "গার্ডিয়ান হিসেবে আপনার নাম", en: "Your name, as a guardian" },
  mobileNumber: { bn: "মোবাইল নম্বর", en: "Mobile number" },
  messageOptional: { bn: "বার্তা (ঐচ্ছিক)", en: "Message (optional)" },
  msgPhForGuardianPost: {
    bn: "আপনার অভিজ্ঞতা ও পড়ানোর সময় সম্পর্কে সংক্ষেপে লিখুন…",
    en: "Briefly describe your experience and the times you can teach…",
  },
  msgPhForTutorPost: {
    bn: "শিক্ষার্থী ও পড়ানোর সময় সম্পর্কে সংক্ষেপে লিখুন…",
    en: "Briefly describe the student and the study times…",
  },
  errEnterName: { bn: "আপনার নাম লিখুন", en: "Please enter your name" },
  errEnterPhone: { bn: "মোবাইল নম্বর দিন", en: "Please enter your mobile number" },
  applyFail: { bn: "আবেদন পাঠানো যায়নি", en: "Could not send the application" },
  sending: { bn: "পাঠানো হচ্ছে…", en: "Sending…" },
  sendApplication: { bn: "আবেদন পাঠান", en: "Send application" },
  reportDoneMsg: {
    bn: "রিপোর্ট পাওয়া গেছে — অ্যাডমিন যাচাই করে ব্যবস্থা নেবেন।",
    en: "Report received — the admin will review it and take action.",
  },
  reportReasonField: { bn: "রিপোর্টের কারণ", en: "Reason for the report" },
  yourNameOptional: { bn: "আপনার নাম (ঐচ্ছিক)", en: "Your name (optional)" },
  detailsOptional: { bn: "বিস্তারিত (ঐচ্ছিক)", en: "Details (optional)" },
  sendReport: { bn: "রিপোর্ট পাঠান", en: "Send report" },
  cancelBtn: { bn: "বাতিল", en: "Cancel" },
  reportLink: {
    bn: "এই পোস্টে সমস্যা থাকলে রিপোর্ট করুন",
    en: "Report a problem with this post",
  },
  reportFail: { bn: "রিপোর্ট পাঠানো যায়নি", en: "Could not send the report" },

  /* post form */
  postDoneTitle: { bn: "পোস্ট জমা হয়েছে!", en: "Post submitted!" },
  postDoneApproved: {
    bn: "আপনার পোস্টটি এখন বোর্ডে সবার জন্য দেখা যাচ্ছে।",
    en: "Your post is now live on the board for everyone to see.",
  },
  postDonePending: {
    bn: "আপনার পোস্টটি অ্যাডমিনের অনুমোদনের অপেক্ষায় আছে। অনুমোদন হলেই বোর্ডে দেখা যাবে — সাধারণত খুব দ্রুতই হয়ে যায়।",
    en: "Your post is waiting for admin approval. Once approved it will appear on the board — usually very quickly.",
  },
  goToBoard: { bn: "বোর্ডে যান", en: "Go to the board" },
  newPostTitle: { bn: "নতুন পোস্ট দিন", en: "Create a new post" },
  requiredNote: { bn: "* চিহ্নিতগুলো আবশ্যক", en: "* marked fields are required" },
  secIdentity: { bn: "পরিচয়", en: "Your details" },
  secSubjects: { bn: "পড়ার বিষয়", en: "Subjects & class" },
  secArea: { bn: "এলাকা", en: "Area" },
  secTimeSalary: { bn: "সময় ও বেতন", en: "Schedule & salary" },
  secGenderPref: { bn: "শিক্ষক / শিক্ষিকা পছন্দ", en: "Teacher preference" },
  secDetails: { bn: "বিস্তারিত", en: "Details" },
  previewTitle: { bn: "প্রিভিউ — পোস্টটি এমন দেখাবে", en: "Preview — this is how your post will look" },
  previewEmpty: {
    bn: "নাম, শিরোনাম বা বিষয় লিখলেই এখানে প্রিভিউ দেখা যাবে।",
    en: "Type a name, title or subject to see the preview here.",
  },
  noteAutoApprove: {
    bn: "পোস্ট দিলেই তা সরাসরি বোর্ডে প্রকাশিত হবে।",
    en: "Posts are published directly on the board.",
  },
  notePendingApproval: {
    bn: "পোস্ট দেওয়ার পর অ্যাডমিন অনুমোদন করলেই বোর্ডে দেখা যাবে।",
    en: "After you post, it will appear on the board once the admin approves it.",
  },
  iAmGuardian: { bn: "আমি গার্ডিয়ান — টিউটর খুঁজছি", en: "I'm a guardian — looking for a tutor" },
  iAmTutor: { bn: "আমি টিউটর — টিউশনি খুঁজছি", en: "I'm a tutor — looking for tuition" },
  yourNameStar: { bn: "আপনার নাম *", en: "Your name *" },
  nameExample: { bn: "যেমন: মোঃ রফিকুল ইসলাম", en: "e.g. Md. Rafiqul Islam" },
  mobileStar: { bn: "মোবাইল নম্বর *", en: "Mobile number *" },
  mobileHint: {
    bn: "আগ্রহীরা এই নম্বরে কল করে যোগাযোগ করবেন",
    en: "Interested people will call this number to contact you",
  },
  titleStar: { bn: "শিরোনাম *", en: "Title *" },
  titlePhGuardian: {
    bn: "যেমন: ১০ম শ্রেণির গণিতের জন্য অভিজ্ঞ টিউটর চাই",
    en: "e.g. Experienced maths tutor needed for Class 10",
  },
  titlePhTutor: {
    bn: "যেমন: গণিত ও পদার্থবিজ্ঞানে অভিজ্ঞ টিউটর — HSC পর্যন্ত পড়াই",
    en: "e.g. Experienced maths and physics tutor — teaches up to HSC",
  },
  subjectsStar: { bn: "বিষয় *", en: "Subjects *" },
  chooseSubjectsAria: { bn: "বিষয় বেছে নিন", en: "Choose subjects" },
  classesStar: { bn: "শ্রেণি *", en: "Classes *" },
  chooseClassesAria: { bn: "শ্রেণি বেছে নিন", en: "Choose classes" },
  areaStar: { bn: "এলাকা *", en: "Area *" },
  chooseArea: { bn: "এলাকা বেছে নিন", en: "Choose an area" },
  addressNoteLabel: { bn: "ঠিকানার বিবরণ (ঐচ্ছিক)", en: "Address note (optional)" },
  addressNotePh: { bn: "যেমন: লালবাগ মোড়ের কাছে", en: "e.g. Near Lalbag Mor" },
  budgetMinGuardian: { bn: "বাজেট — সর্বনিম্ন (৳/মাস)", en: "Budget — minimum (৳/month)" },
  budgetMinTutor: { bn: "প্রত্যাশিত বেতন — সর্বনিম্ন (৳/মাস)", en: "Expected salary — minimum (৳/month)" },
  budgetMaxGuardian: { bn: "বাজেট — সর্বোচ্চ (৳/মাস)", en: "Budget — maximum (৳/month)" },
  budgetMaxTutor: { bn: "প্রত্যাশিত বেতন — সর্বোচ্চ (৳/মাস)", en: "Expected salary — maximum (৳/month)" },
  salaryNegotiable: { bn: "বেতন আলোচনা সাপেক্ষে", en: "Salary negotiable" },
  daysPerWeekLabel: { bn: "সপ্তাহে কত দিন", en: "Days per week" },
  notSpecified: { bn: "উল্লেখ নেই", en: "Not specified" },
  dayOption: { bn: "{n} দিন", en: "{n} days" },
  studentGenderLabel: { bn: "শিক্ষার্থীর লিঙ্গ", en: "Student's gender" },
  prefTutorLabel: { bn: "পছন্দের টিউটর", en: "Preferred tutor" },
  maleTutorOpt: { bn: "ছেলে টিউটর", en: "Male tutor" },
  femaleTutorOpt: { bn: "মেয়ে টিউটর", en: "Female tutor" },
  maleOpt: { bn: "ছেলে", en: "Male" },
  femaleOpt: { bn: "মেয়ে", en: "Female" },
  yourGenderLabel: { bn: "আপনার লিঙ্গ", en: "Your gender" },
  institutionLabel: { bn: "প্রতিষ্ঠান (বিশ্ববিদ্যালয়/কলেজ)", en: "Institution (university/college)" },
  institutionPh: { bn: "যেমন: বেগম রোকেয়া বিশ্ববিদ্যালয়", en: "e.g. Begum Rokeya University" },
  experienceLabel: { bn: "অভিজ্ঞতা", en: "Experience" },
  experiencePh: { bn: "যেমন: ৩ বছর ধরে HSC গণিত পড়াই", en: "e.g. Teaching HSC maths for 3 years" },
  availabilityLabel: { bn: "কোন সময়ে পড়াতে পারবেন", en: "When can you teach?" },
  availabilityPh: { bn: "যেমন: বিকেল ৪টা – রাত ৯টা", en: "e.g. 4 PM – 9 PM" },
  descriptionLabel: { bn: "বিস্তারিত বিবরণ", en: "Detailed description" },
  descPhGuardian: {
    bn: "শিক্ষার্থীর অবস্থা, পড়ানোর সময়, বিশেষ কোনো শর্ত থাকলে লিখুন…",
    en: "Write about the student's level, study times and any special requirements…",
  },
  descPhTutor: {
    bn: "আপনার পড়ানোর পদ্ধতি, ফলাফল, বিশেষ দক্ষতা সম্পর্কে লিখুন…",
    en: "Write about your teaching method, results and special skills…",
  },
  errTitleShort: { bn: "শিরোনাম অন্তত ৫ অক্ষরের লিখুন", en: "The title must be at least 5 characters" },
  errPickSubject: { bn: "অন্তত একটি বিষয় বেছে নিন", en: "Choose at least one subject" },
  errPickClass: { bn: "অন্তত একটি শ্রেণি বেছে নিন", en: "Choose at least one class" },
  errPickArea: { bn: "এলাকা বেছে নিন", en: "Choose an area" },
  errSalaryRange: {
    bn: "সর্বনিম্ন বেতন সর্বোচ্চ বেতনের বেশি হতে পারে না",
    en: "Minimum salary cannot be higher than maximum salary",
  },
  postFail: { bn: "পোস্ট করা যায়নি", en: "Could not submit the post" },
  submitting: { bn: "জমা হচ্ছে…", en: "Submitting…" },
  submitPostBtn: { bn: "পোস্ট জমা দিন", en: "Submit post" },

  /* favorites */
  loadingShort: { bn: "লোড হচ্ছে…", en: "Loading…" },
  favEmptyTitle: { bn: "প্রিয় তালিকা খালি", en: "Your favorites list is empty" },
  favEmptyBody: {
    bn: "বোর্ডের যেকোনো পোস্টের হার্ট বোতাম চাপ দিলে তা এখানে সংরক্ষিত থাকবে — পরে সহজে খুঁজে পেতে।",
    en: "Tap the heart button on any post on the board and it will be saved here, so you can find it easily later.",
  },

  /* admin */
  adminLoginTitle: { bn: "অ্যাডমিন প্যানেল", en: "Admin Panel" },
  adminLoginBody: {
    bn: "এই অংশটি শুধু অ্যাডমিনের জন্য। পোস্ট অনুমোদন, টিউটর যাচাই, আবেদন ও রিপোর্ট — সবকিছু এখান থেকে পরিচালনা করা যায়।",
    en: "This section is for the admin only. Post approvals, tutor verification, applications and reports — everything is managed from here.",
  },
  passcodeLabel: { bn: "অ্যাডমিন পাসকোড", en: "Admin passcode" },
  passcodePh: { bn: "পাসকোড লিখুন", en: "Enter the passcode" },
  errPasscodeEmpty: { bn: "পাসকোড লিখুন", en: "Enter the passcode" },
  errPasscodeWrong: { bn: "ভুল পাসকোড — আবার চেষ্টা করুন", en: "Wrong passcode — please try again" },
  errVerifyFail: { bn: "যাচাই করা যায়নি — আবার চেষ্টা করুন", en: "Could not verify — please try again" },
  verifying: { bn: "যাচাই হচ্ছে…", en: "Verifying…" },
  loginBtn: { bn: "প্রবেশ করুন", en: "Log in" },
  adminPanelTitle: { bn: "অ্যাডমিন প্যানেল", en: "Admin Panel" },
  logoutBtn: { bn: "লগ আউট", en: "Log out" },
  statPending: { bn: "অনুমোদনের অপেক্ষায়", en: "Awaiting approval" },
  statPublished: { bn: "প্রকাশিত পোস্ট", en: "Published posts" },
  statGuardian: { bn: "গার্ডিয়ান পোস্ট", en: "Guardian posts" },
  statTutor: { bn: "টিউটর অফার", en: "Tutor offers" },
  statNewApps: { bn: "নতুন আবেদন", en: "New applications" },
  statOpenReports: { bn: "খোলা রিপোর্ট", en: "Open reports" },
  statRejectedClosed: { bn: "বাতিল / বন্ধ পোস্ট", en: "Rejected / closed posts" },
  statsLoading: { bn: "পরিসংখ্যান লোড হচ্ছে…", en: "Loading statistics…" },
  tabPosts: { bn: "পোস্টসমূহ", en: "Posts" },
  tabPostsPendingSuffix: { bn: " ({n} অপেক্ষমাণ)", en: " ({n} pending)" },
  tabApplications: { bn: "আবেদন", en: "Applications" },
  tabAppsNewSuffix: { bn: " ({n} নতুন)", en: " ({n} new)" },
  tabReports: { bn: "রিপোর্ট", en: "Reports" },
  tabReportsSuffix: { bn: " ({n})", en: " ({n})" },
  tabSettings: { bn: "সেটিংস", en: "Settings" },
  adminSectionsAria: { bn: "অ্যাডমিন বিভাগ", en: "Admin sections" },
  filterStatusAria: { bn: "স্ট্যাটাস অনুযায়ী ছাঁকুন", en: "Filter by status" },
  allStatuses: { bn: "সব স্ট্যাটাস", en: "All statuses" },
  statusPending: { bn: "অপেক্ষমাণ", en: "Pending" },
  statusApproved: { bn: "প্রকাশিত", en: "Published" },
  statusRejected: { bn: "বাতিল", en: "Rejected" },
  statusClosed: { bn: "বন্ধ", en: "Closed" },
  filterKindAria: { bn: "ধরন অনুযায়ী ছাঁকুন", en: "Filter by type" },
  allKinds: { bn: "সব ধরন", en: "All types" },
  guardianWord: { bn: "গার্ডিয়ান", en: "Guardian" },
  tutorWord: { bn: "টিউটর", en: "Tutor" },
  adminNoPostsTitle: { bn: "কোনো পোস্ট নেই", en: "No posts" },
  adminNoPostsBody: { bn: "এই ফিল্টারে কোনো পোস্ট পাওয়া যায়নি।", en: "No posts match this filter." },
  chipVerifiedShort: { bn: "যাচাইকৃত", en: "Verified" },
  applicationsCount: { bn: "আবেদন: {n}", en: "Applications: {n}" },
  approveBtn: { bn: "অনুমোদন", en: "Approve" },
  rejectBtn: { bn: "বাতিল", en: "Reject" },
  closeBtn: { bn: "বন্ধ করুন", en: "Close" },
  rePendingBtn: { bn: "পুনরায় অপেক্ষমাণ করুন", en: "Move back to pending" },
  featuredRemoveBtn: { bn: "ফিচার্ড সরান", en: "Remove featured" },
  featuredAddBtn: { bn: "ফিচার্ড করুন", en: "Make featured" },
  verifyRemoveBtn: { bn: "যাচাই বাতিল", en: "Remove verification" },
  verifyTutorBtn: { bn: "টিউটর যাচাই করুন", en: "Verify tutor" },
  editBtn: { bn: "সম্পাদনা", en: "Edit" },
  confirmDeleteBtn: { bn: "নিশ্চিত মুছুন", en: "Confirm delete" },
  keepBtn: { bn: "থাক", en: "Keep it" },
  deleteBtn: { bn: "মুছুন", en: "Delete" },
  failedShort: { bn: "হয়নি", en: "Failed" },
  couldNotDelete: { bn: "মোছা যায়নি", en: "Could not delete" },
  noAppsTitle: { bn: "কোনো আবেদন নেই", en: "No applications" },
  noAppsBody: {
    bn: "বোর্ডের পোস্টে আবেদন এলেই তা এখানে দেখা যাবে।",
    en: "Applications to posts on the board will appear here.",
  },
  appStatusNew: { bn: "নতুন", en: "New" },
  appStatusContacted: { bn: "যোগাযোগ হয়েছে", en: "Contacted" },
  appStatusAccepted: { bn: "গৃহীত", en: "Accepted" },
  appStatusRejected: { bn: "প্রত্যাখ্যাত", en: "Rejected" },
  tutorApplicationChip: { bn: "টিউটরের আবেদন", en: "Tutor's application" },
  guardianContactChip: { bn: "গার্ডিয়ানের যোগাযোগ", en: "Guardian's contact" },
  postColon: { bn: "পোস্ট:", en: "Post:" },
  markContactedBtn: { bn: "যোগাযোগ হয়েছে", en: "Mark as contacted" },
  markAcceptedBtn: { bn: "গৃহীত করুন", en: "Accept" },
  markRejectedBtn: { bn: "প্রত্যাখ্যান", en: "Reject" },
  markNewBtn: { bn: "নতুন করুন", en: "Mark as new" },
  deleteWordBtn: { bn: "মুছুন", en: "Delete" },
  /* Commission (admin only, tracking only — no rate is set; the amount
     starts empty and the admin fills it in when an application is
     accepted). */
  commissionLabel: { bn: "কমিশন", en: "Commission" },
  commissionAmountPh: { bn: "টাকার পরিমাণ (৳)", en: "Amount in BDT (৳)" },
  commissionNotSet: { bn: "পরিমাণ বসানো হয়নি", en: "Amount not set" },
  commissionPending: { bn: "বাকি", en: "Pending" },
  commissionPaid: { bn: "পরিশোধিত", en: "Paid" },
  commissionWaived: { bn: "মওকুফ", en: "Waived" },
  commissionSaved: { bn: "কমিশন সংরক্ষিত হয়েছে", en: "Commission saved" },
  commissionSaveFail: { bn: "কমিশন সংরক্ষণ হয়নি", en: "Could not save the commission" },
  noReportsTitle: { bn: "কোনো রিপোর্ট নেই", en: "No reports" },
  noReportsBody: {
    bn: "ব্যবহারকারীরা পোস্টে রিপোর্ট করলে তা এখানে আসবে।",
    en: "When users report a post, it will appear here.",
  },
  reportStatusOpen: { bn: "খোলা", en: "Open" },
  reportStatusResolved: { bn: "সমাধান হয়েছে", en: "Resolved" },
  reportStatusDismissed: { bn: "উপেক্ষিত", en: "Dismissed" },
  reporterColon: { bn: "রিপোর্টকারী:", en: "Reporter:" },
  resolveBtn: { bn: "সমাধান হয়েছে", en: "Mark resolved" },
  dismissBtn: { bn: "উপেক্ষা করুন", en: "Dismiss" },
  reopenBtn: { bn: "আবার খুলুন", en: "Reopen" },

  /* admin edit post */
  editPostTitle: { bn: "পোস্ট সম্পাদনা", en: "Edit post" },
  editPostAria: { bn: "পোস্ট সম্পাদনা", en: "Edit post" },
  fTitle: { bn: "শিরোনাম", en: "Title" },
  fName: { bn: "নাম", en: "Name" },
  fMobile: { bn: "মোবাইল", en: "Mobile" },
  fDescription: { bn: "বিবরণ", en: "Description" },
  errTitleAdmin: { bn: "শিরোনাম অন্তত ৫ অক্ষরের হতে হবে", en: "The title must be at least 5 characters" },
  errNameAdmin: { bn: "নাম লিখুন", en: "Enter a name" },
  errPhoneAdmin: { bn: "ফোন নম্বর দিন", en: "Enter a phone number" },
  saving: { bn: "সংরক্ষণ হচ্ছে…", en: "Saving…" },
  saveBtn: { bn: "সংরক্ষণ করুন", en: "Save" },

  /* admin settings */
  noticeLabel: { bn: "নোটিস ব্যানার", en: "Notice banner" },
  noticeHint: {
    bn: "বোর্ডের একদম উপরে দেখানো হবে। খালি রাখলে ব্যানার দেখাবে না।",
    en: "Shown at the very top of the board. Leave it empty to hide the banner.",
  },
  noticePh: { bn: "যেমন: ঈদের ছুটিতে অফিস বন্ধ থাকবে…", en: "e.g. The office will be closed during the Eid holidays…" },
  autoApproveLabel: { bn: "নতুন পোস্ট সরাসরি প্রকাশ (অটো-অনুমোদন)", en: "Publish new posts directly (auto-approve)" },
  autoApproveHint: {
    bn: "চালু থাকলে নতুন পোস্ট অ্যাডমিনের অনুমোদন ছাড়াই বোর্ডে দেখা যাবে।",
    en: "When on, new posts appear on the board without admin approval.",
  },
  newPasscodeLabel: { bn: "নতুন অ্যাডমিন পাসকোড", en: "New admin passcode" },
  newPasscodeHint: { bn: "বদলাতে না চাইলে খালি রাখুন।", en: "Leave empty if you don't want to change it." },
  errPasscodeShort: {
    bn: "নতুন পাসকোড অন্তত ৪ অক্ষরের হতে হবে",
    en: "The new passcode must be at least 4 characters",
  },
  settingsSavedMsg: { bn: "সেটিংস সংরক্ষিত হয়েছে", en: "Settings saved" },
  saveSettingsBtn: { bn: "সেটিংস সংরক্ষণ করুন", en: "Save settings" },
  passcodeEnvHint: {
    bn: "পাসকোডটি ADMIN_PASSCODE env variable দিয়ে সেট করা আছে — বদলাতে হলে Vercel-এর Environment Variables থেকে বদলান।",
    en: "The passcode is set through the ADMIN_PASSCODE environment variable — change it from Vercel's Environment Variables.",
  },
  chatAiLabel: { bn: "AI চ্যাট সহকারী", en: "AI chat assistant" },
  chatAiHint: {
    bn: "বন্ধ থাকলে ভিজিটরের বার্তায় AI উত্তর দেবে না — সব বার্তা অ্যাডমিন ইনবক্সে অপেক্ষা করবে।",
    en: "When off, the AI won't answer visitors — every message will wait in the admin inbox.",
  },
  deployTitle: { bn: "লাইভ ওয়েবসাইট", en: "Live website" },
  deployBody: {
    bn: "Vercel প্রজেক্টের নাম barakatutors — লাইভ ঠিকানা barakatutors.vercel.app। ডাটাবেস hosted (Turso), অ্যাডমিন পাসকোড ADMIN_PASSCODE env variable-এ থাকে, কোডে নয়।",
    en: "The Vercel project name is barakatutors — live at barakatutors.vercel.app. The database is hosted (Turso) and the admin passcode lives in the ADMIN_PASSCODE env variable, not in code.",
  },
  liveSiteLink: { bn: "barakatutors.vercel.app খুলুন", en: "Open barakatutors.vercel.app" },

  /* live chat widget */
  chatOpenAria: { bn: "চ্যাট খুলুন", en: "Open chat" },
  chatTitle: { bn: "বারাকা সহকারী", en: "Baraka Assistant" },
  chatSubtitleAi: { bn: "AI সহকারী উত্তর দিচ্ছে", en: "The AI assistant is replying" },
  chatSubtitleAdmin: { bn: "অ্যাডমিন এই চ্যাটটি দেখছেন", en: "The admin is handling this chat" },
  chatSubtitleOff: {
    bn: "বার্তা পাঠান — অ্যাডমিন রিপ্লাই করবেন",
    en: "Send a message — the admin will reply",
  },
  chatNamePh: { bn: "আপনার নাম (ঐচ্ছিক)", en: "Your name (optional)" },
  chatStartBtn: { bn: "চ্যাট শুরু করুন", en: "Start chat" },
  chatInputPh: { bn: "বার্তা লিখুন…", en: "Write a message…" },
  chatSendAria: { bn: "বার্তা পাঠান", en: "Send message" },
  chatSenderAi: { bn: "সহকারী", en: "Assistant" },
  chatSenderAdmin: { bn: "অ্যাডমিন", en: "Admin" },
  chatSenderYou: { bn: "আপনি", en: "You" },
  chatWaitingAdmin: {
    bn: "অ্যাডমিনের রিপ্লাইয়ের অপেক্ষায়…",
    en: "Waiting for the admin to reply…",
  },
  chatEscalated: {
    bn: "এই চ্যাটটি অ্যাডমিনের কাছে পাঠানো হয়েছে",
    en: "This chat has been passed to the admin",
  },
  chatStartFail: { bn: "চ্যাট শুরু করা যায়নি — আবার চেষ্টা করুন", en: "Could not start the chat — please try again" },
  chatSendFail: { bn: "বার্তা পাঠানো যায়নি", en: "Could not send the message" },

  /* admin chat inbox */
  tabChats: { bn: "চ্যাট", en: "Chats" },
  tabChatsSuffix: { bn: " ({n}টি অ্যাডমিনের জন্য)", en: " ({n} need admin)" },
  noChatsTitle: { bn: "কোনো চ্যাট নেই", en: "No chats yet" },
  noChatsBody: {
    bn: "ভিজিটররা সাইটের চ্যাট বাটন থেকে বার্তা পাঠালেই তা এখানে দেখা যাবে।",
    en: "When visitors send a message from the site's chat button, it will appear here.",
  },
  chatModeAi: { bn: "AI উত্তর দিচ্ছে", en: "AI is replying" },
  chatModeAdmin: { bn: "অ্যাডমিন নিয়েছেন", en: "Admin has taken over" },
  chatNeedsAdmin: { bn: "অ্যাডমিনের জন্য", en: "Needs admin" },
  chatVisitorAnon: { bn: "নামহীন ভিজিটর", en: "Unnamed visitor" },
  takeoverBtn: { bn: "নিজে নিন (AI থামবে)", en: "Take over (AI pauses)" },
  handBackBtn: { bn: "AI-কে ফিরিয়ে দিন", en: "Hand back to AI" },
  chatReplyPh: { bn: "অ্যাডমিন হিসেবে রিপ্লাই লিখুন…", en: "Write a reply as admin…" },
  chatReplyBtn: { bn: "রিপ্লাই পাঠান", en: "Send reply" },
  chatBackBtn: { bn: "সব চ্যাট", en: "All chats" },
  chatAiToggleLabel: { bn: "AI উত্তর", en: "AI replies" },

  /* tutor accounts */
  navDashboard: { bn: "ড্যাশবোর্ড", en: "Dashboard" },
  tutorSignupTitle: { bn: "টিউটর অ্যাকাউন্ট তৈরি করুন", en: "Create a Tutor Account" },
  tutorSignupSub: {
    bn: "অ্যাকাউন্ট খুলে আপনার প্রোফাইল সাজান — গার্ডিয়ানরা আপনাকে খুঁজে পাবেন, আর আপনি টিউশনিতে আবেদন করতে পারবেন।",
    en: "Open an account and set up your profile — guardians will find you, and you can apply for tuitions.",
  },
  tutorLoginTitle: { bn: "টিউটর লগইন", en: "Tutor Login" },
  tutorLoginSub: {
    bn: "আপনার মোবাইল নম্বর ও পাসওয়ার্ড দিয়ে লগইন করুন।",
    en: "Log in with your mobile number and password.",
  },
  fPassword: { bn: "পাসওয়ার্ড", en: "Password" },
  passwordHint: { bn: "কমপক্ষে ৬ অক্ষরের হতে হবে", en: "Must be at least 6 characters" },
  universityLabel: { bn: "বিশ্ববিদ্যালয় *", en: "University *" },
  universityPh: { bn: "যেমন: বেগম রোকেয়া বিশ্ববিদ্যালয়", en: "e.g. Begum Rokeya University" },
  departmentLabel: { bn: "বিভাগ *", en: "Department *" },
  departmentPh: { bn: "যেমন: গণিত", en: "e.g. Mathematics" },
  feesLabel: { bn: "আপনার ফি (ঐচ্ছিক)", en: "Your fees (optional)" },
  feesPh: { bn: "যেমন: প্রতি মাসে ৫০০০ টাকা", en: "e.g. 5000 taka per month" },
  photoUrlLabel: { bn: "ছবির লিংক (ঐচ্ছিক)", en: "Photo link (optional)" },
  photoUrlHint: {
    bn: "আপনার ছবির URL দিন — ফাইল আপলোড করা যায় না।",
    en: "Paste a URL of your photo — file upload is not available.",
  },
  areasLabel: { bn: "এলাকা *", en: "Areas *" },
  chooseAreasAria: { bn: "এলাকা বেছে নিন", en: "Choose areas" },
  genderOtherOpt: { bn: "অন্যান্য", en: "Other" },
  signupBtn: { bn: "অ্যাকাউন্ট তৈরি করুন", en: "Create account" },
  creatingAccount: { bn: "অ্যাকাউন্ট তৈরি হচ্ছে…", en: "Creating account…" },
  alreadyHaveAccount: { bn: "ইতিমধ্যে অ্যাকাউন্ট আছে?", en: "Already have an account?" },
  noAccountYet: { bn: "অ্যাকাউন্ট নেই?", en: "Don't have an account yet?" },
  goToLoginBtn: { bn: "লগইন করুন", en: "Log in" },
  goToSignupBtn: { bn: "অ্যাকাউন্ট তৈরি করুন", en: "Create an account" },
  loggingIn: { bn: "লগইন হচ্ছে…", en: "Logging in…" },
  tutorDashboardTitle: { bn: "আমার ড্যাশবোর্ড", en: "My Dashboard" },
  verifiedTutorBadge: { bn: "যাচাইকৃত টিউটর", en: "Verified tutor" },
  verificationPending: { bn: "যাচাইয়ের অপেক্ষায়", en: "Verification pending" },
  verificationPendingNote: {
    bn: "অ্যাডমিন আপনার তথ্য যাচাই করলে যাচাইকৃত ব্যাজ দেখা যাবে।",
    en: "Once the admin checks your information, you'll get a verified badge.",
  },
  tabProfile: { bn: "প্রোফাইল", en: "Profile" },
  tabMyOffers: { bn: "আমার অফার", en: "My offers" },
  tabMyApps: { bn: "আমার আবেদন", en: "My applications" },
  editProfileBtn: { bn: "প্রোফাইল সম্পাদনা", en: "Edit profile" },
  profileSavedMsg: { bn: "প্রোফাইল সংরক্ষিত হয়েছে", en: "Profile saved" },
  myOffersTitle: { bn: "আমার অফার", en: "My offers" },
  myOffersEmptyTitle: { bn: "এখনো কোনো অফার নেই", en: "No offers yet" },
  myOffersEmptyBody: {
    bn: "আপনার মোবাইল নম্বরে পোস্ট করা টিউটর অফারগুলো এখানে দেখা যাবে। নতুন অফার পোস্ট করুন।",
    en: "Tutor offers posted with your mobile number will appear here. Post a new offer.",
  },
  newOfferBtn: { bn: "নতুন অফার পোস্ট করুন", en: "Post a new offer" },
  myAppsTitle: { bn: "আমার আবেদন", en: "My applications" },
  appsSentTitle: { bn: "আমি যেসব টিউশনিতে আবেদন করেছি", en: "Applications I sent" },
  appsReceivedTitle: { bn: "আমার পোস্টে যেসব আবেদন এসেছে", en: "Applications received on my posts" },
  noSentAppsTitle: { bn: "কোনো আবেদন পাঠাননি", en: "No applications sent" },
  noSentAppsBody: {
    bn: "বোর্ডের গার্ডিয়ান পোস্টে আবেদন করলেই তা এখানে দেখা যাবে।",
    en: "When you apply to a guardian post on the board, it will appear here.",
  },
  noReceivedAppsTitle: { bn: "এখনো কোনো আবেদন আসেনি", en: "No applications received yet" },
  noReceivedAppsBody: {
    bn: "আপনার টিউটর অফারে কেউ আবেদন করলেই তা এখানে দেখা যাবে।",
    en: "When someone applies to your tutor offer, it will appear here.",
  },
  maskedPhoneNote: {
    bn: "আবেদনকারীর মোবাইল নম্বর আংশিক লুকানো আছে — আবেদন গৃহীত করলেই পুরো নম্বর দেখা যাবে।",
    en: "Applicant phone numbers are partly hidden — accept an application to see the full number.",
  },
  applicantColon: { bn: "আবেদনকারী:", en: "Applicant:" },
  feesRowLabel: { bn: "ফি", en: "Fees" },
} as const;

export type StringKey = keyof typeof S;

export function translate(
  lang: Lang,
  key: StringKey,
  vars?: Record<string, string | number>,
): string {
  let text: string = S[key][lang];
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<LangCtx>({
  lang: "bn",
  setLang: () => undefined,
  t: (key, vars) => translate("bn", key, vars),
});

const STORAGE_KEY = "baraka-lang";

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "bn";
    } catch {
      return "bn";
    }
  });

  useEffect(() => {
    document.documentElement.lang = lang === "bn" ? "bn" : "en";
    document.title =
      lang === "bn" ? "Baraka Tutors — বারাকা টিউটরস, রংপুর" : "Baraka Tutors — Rangpur";
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* storage unavailable — language just won't persist */
    }
  };

  const value: LangCtx = {
    lang,
    setLang,
    t: (key, vars) => translate(lang, key, vars),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang(): LangCtx {
  return useContext(Ctx);
}
