import type { ApiResponse } from "./api";
import type { api } from "./api";

export type Post = ApiResponse<typeof api, "listPosts">["posts"][number];
export type PostKind = Post["kind"];

export type Lang = "bn" | "en";

export const AREAS = [
  "লালবাগ",
  "ধাপ",
  "জাহাজ কোম্পানি মোড়",
  "ক্যাচারী বাজার",
  "শাপলা চত্বর",
  "মেডিকেল মোড়",
  "কলেজ পাড়া",
  "কামালকাছনা",
  "মাহিগঞ্জ",
  "হাজিরহাট",
  "পায়রা চত্বর",
  "বাহারকাছনা",
  "তাজহাট",
  "গুপ্তপাড়া",
  "বিনোদপুর",
  "হারাগাছ",
  "মিঠাপুকুর",
  "বদরগঞ্জ",
  "পীরগঞ্জ",
  "পীরগাছা",
  "কাউনিয়া",
  "গঙ্গাচড়া",
  "তারাগঞ্জ",
  "রংপুর সদর (অন্যান্য)",
  "অনলাইন (সারা দেশ)",
];

export const SUBJECTS = [
  "গণিত",
  "উচ্চতর গণিত",
  "ইংরেজি",
  "বাংলা",
  "পদার্থবিজ্ঞান",
  "রসায়ন",
  "জীববিজ্ঞান",
  "সাধারণ বিজ্ঞান",
  "সমাজবিজ্ঞান",
  "আইসিটি",
  "হিসাববিজ্ঞান",
  "ফিন্যান্স ও ব্যাংকিং",
  "অর্থনীতি",
  "ইসলাম শিক্ষা",
  "আরবি",
  "সাধারণ জ্ঞান",
  "সব বিষয়",
];

export const CLASSES = [
  "প্লে–নার্সারি",
  "১ম শ্রেণি",
  "২য় শ্রেণি",
  "৩য় শ্রেণি",
  "৪র্থ শ্রেণি",
  "৫ম শ্রেণি",
  "৬ষ্ঠ শ্রেণি",
  "৭ম শ্রেণি",
  "৮ম শ্রেণি",
  "৯ম শ্রেণি",
  "১০ম শ্রেণি",
  "একাদশ (HSC)",
  "দ্বাদশ (HSC)",
  "ভর্তি প্রস্তুতি",
  "অন্যান্য",
];

const AREAS_EN = [
  "Lalbag",
  "Dhap",
  "Jahaj Company Mor",
  "Kachari Bazar",
  "Shapla Chattar",
  "Medical Mor",
  "College Para",
  "Kamalkachna",
  "Mahiganj",
  "Hajirhat",
  "Payra Chattar",
  "Baharkachna",
  "Tajhat",
  "Guptopara",
  "Binodpur",
  "Haragach",
  "Mithapukur",
  "Badarganj",
  "Pirganj",
  "Pirgachha",
  "Kaunia",
  "Gangachara",
  "Taraganj",
  "Rangpur Sadar (other areas)",
  "Online (whole country)",
];

const SUBJECTS_EN = [
  "Mathematics",
  "Higher Mathematics",
  "English",
  "Bangla",
  "Physics",
  "Chemistry",
  "Biology",
  "General Science",
  "Social Science",
  "ICT",
  "Accounting",
  "Finance & Banking",
  "Economics",
  "Islamic Studies",
  "Arabic",
  "General Knowledge",
  "All Subjects",
];

const CLASSES_EN = [
  "Play–Nursery",
  "Class 1",
  "Class 2",
  "Class 3",
  "Class 4",
  "Class 5",
  "Class 6",
  "Class 7",
  "Class 8",
  "Class 9",
  "Class 10",
  "Class 11 (HSC)",
  "Class 12 (HSC)",
  "Admission Preparation",
  "Other",
];

function labelFrom(bnList: string[], enList: string[], value: string, lang: Lang): string {
  if (lang !== "en") return value;
  const i = bnList.indexOf(value);
  return i >= 0 ? (enList[i] ?? value) : value;
}

export function areaLabel(value: string, lang: Lang): string {
  return labelFrom(AREAS, AREAS_EN, value, lang);
}

export function subjectLabel(value: string, lang: Lang): string {
  return labelFrom(SUBJECTS, SUBJECTS_EN, value, lang);
}

export function classLabel(value: string, lang: Lang): string {
  return labelFrom(CLASSES, CLASSES_EN, value, lang);
}

export const REPORT_REASONS: { value: string; label: string; labelEn: string }[] = [
  { value: "wrong_info", label: "ভুল তথ্য", labelEn: "Wrong information" },
  { value: "spam", label: "স্প্যাম", labelEn: "Spam" },
  { value: "fraud", label: "প্রতারণা", labelEn: "Fraud" },
  { value: "inappropriate", label: "অনুপযুক্ত আচরণ", labelEn: "Inappropriate behaviour" },
  { value: "other", label: "অন্যান্য", labelEn: "Other" },
];

export function reportReasonLabel(value: string, lang: Lang = "bn"): string {
  const r = REPORT_REASONS.find((x) => x.value === value);
  if (!r) return value;
  return lang === "en" ? r.labelEn : r.label;
}

export function modeLabel(mode: Post["mode"], lang: Lang = "bn"): string {
  if (lang === "en") return mode === "home" ? "At home" : mode === "online" ? "Online" : "Home + Online";
  return mode === "home" ? "বাসায়" : mode === "online" ? "অনলাইন" : "বাসায় + অনলাইন";
}

export function mediumLabel(medium: Post["medium"], lang: Lang = "bn"): string {
  if (lang === "en")
    return medium === "bangla" ? "Bangla medium" : medium === "english" ? "English medium" : "Bangla + English";
  return medium === "bangla" ? "বাংলা মাধ্যম" : medium === "english" ? "ইংরেজি মাধ্যম" : "বাংলা + ইংরেজি";
}

export function genderLabel(g: Post["genderPref"], lang: Lang = "bn"): string {
  if (lang === "en") return g === "male" ? "Male" : g === "female" ? "Female" : "Any";
  return g === "male" ? "ছেলে" : g === "female" ? "মেয়ে" : "যেকোনো";
}

export function salaryText(post: Post, lang: Lang = "bn"): string {
  const fmt = (n: number) => `৳${n.toLocaleString("en-IN")}`;
  const per = lang === "en" ? "/month" : "/মাস";
  if (post.salaryMin != null && post.salaryMax != null) {
    return post.salaryMin === post.salaryMax
      ? `${fmt(post.salaryMin)} ${per}`
      : `${fmt(post.salaryMin)} – ${fmt(post.salaryMax)} ${per}`;
  }
  if (post.salaryMax != null)
    return lang === "en" ? `Up to ${fmt(post.salaryMax)} ${per}` : `${fmt(post.salaryMax)} পর্যন্ত /মাস`;
  if (post.salaryMin != null)
    return lang === "en" ? `From ${fmt(post.salaryMin)} ${per}` : `${fmt(post.salaryMin)} থেকে /মাস`;
  if (post.salaryNegotiable) return lang === "en" ? "Negotiable" : "আলোচনা সাপেক্ষে";
  return lang === "en" ? "Salary not mentioned" : "বেতন উল্লেখ নেই";
}

export function timeAgo(iso: string, lang: Lang = "bn"): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  const en = lang === "en";
  if (mins < 1) return en ? "Just now" : "এইমাত্র";
  if (mins < 60) return en ? `${mins} min ago` : `${toBn(mins)} মিনিট আগে`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return en ? `${hours} hr ago` : `${toBn(hours)} ঘণ্টা আগে`;
  const days = Math.floor(hours / 24);
  if (days < 30) return en ? `${days} days ago` : `${toBn(days)} দিন আগে`;
  const months = Math.floor(days / 30);
  if (months < 12) return en ? `${months} months ago` : `${toBn(months)} মাস আগে`;
  const years = Math.floor(months / 12);
  return en ? `${years} years ago` : `${toBn(years)} বছর আগে`;
}

export function fmtNum(n: number | string, lang: Lang): string {
  return lang === "en" ? String(n) : toBn(n);
}

export function toBn(n: number | string): string {
  const digits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  return String(n).replace(/[0-9]/g, (d) => digits[Number(d)] ?? d);
}

export function fullDate(iso: string, lang: Lang = "bn"): string {
  return new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "bn-BD", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
