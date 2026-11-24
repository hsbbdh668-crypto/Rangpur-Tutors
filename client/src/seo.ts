// SEO / GEO content + helpers for Baraka Tutors.
//
// Everything here comes from the approved keyword research
// (~/workspace/research_notes/baraka-tutors-keyword-research-20261123-2235):
// P0 homepage title/meta/H1, the 7 homepage FAQ questions (GEO #1, 2, 3, 6,
// 10, 11, 14 verbatim), area pages for the 9 Rangpur areas, and the fee
// guide. NO search-volume numbers are used anywhere (none could be
// verified). Fee answers say "আনুমানিক" and use Baraka's OWN post salary
// range (৳২,৫০০–৮,০০০/month, from the platform's current posts) — never a
// competitor's fee table (competitor ranges conflict with each other).

import type { Lang, Post } from "./lib";
import { areaLabel, classLabel, subjectLabel } from "./lib";

export const SITE_URL = "https://barakatutors.vercel.app";
export const OG_IMAGE = `${SITE_URL}/baraka-logo.webp`;

/* ---------------- titles & descriptions ---------------- */

export const HOME_TITLE: Record<Lang, string> = {
  bn: "রংপুরে হোম টিউটর ও টিউশন — Baraka Tutors | Home Tutor in Rangpur",
  en: "Home Tutor in Rangpur — Baraka Tutors | Private Tutors for SSC, HSC",
};

export const HOME_DESC: Record<Lang, string> = {
  bn: "রংপুরে যাচাইকৃত হোম টিউটর খুঁজুন — ধাপ, লালবাগ, মর্ডান মোড়সহ সব এলাকায় SSC/HSC, গণিত, ইংরেজি, পদার্থবিজ্ঞানের অভিজ্ঞ শিক্ষক/শিক্ষিকা।",
  en: "Find verified home tutors in Rangpur — experienced male and female tutors for SSC/HSC, Math, English and Physics in Dhap, Lalbagh, Modern Mor and every area of Rangpur.",
};

export const BOARD_TITLE: Record<Lang, string> = {
  bn: "টিউটর খুঁজুন — রংপুরে হোম টিউটর ও টিউশন | Baraka Tutors",
  en: "Find a Tutor — Home Tutors in Rangpur | Baraka Tutors",
};

export const JOBS_TITLE: Record<Lang, string> = {
  bn: "টিউশন জব রংপুর — Tuition Jobs in Rangpur | Baraka Tutors",
  en: "Tuition Jobs in Rangpur — টিউশন জব রংপুর | Baraka Tutors",
};

export const FEES_TITLE: Record<Lang, string> = {
  bn: "রংপুরে হোম টিউটরের বেতন কত? — টিউশন ফি গাইড | Baraka Tutors",
  en: "Home Tutor Fees in Rangpur — How Much Does a Private Tutor Cost? | Baraka Tutors",
};

/** Post page title: [শ্রেণি] [বিষয়] টিউটর — [এলাকা], রংপুর (research §8). */
export function postSeoTitle(post: Post, lang: Lang): string {
  const classes = post.classes.map((c) => classLabel(c, lang)).join(", ");
  const subjects = post.subjects.map((s) => subjectLabel(s, lang)).join(", ");
  const area = areaLabel(post.area, lang);
  if (lang === "en") {
    const what = post.kind === "guardian" ? "Tutor Wanted" : "Tutor";
    return `${classes} ${subjects} ${what} — ${area}, Rangpur | Baraka Tutors`;
  }
  const what = post.kind === "guardian" ? "টিউটর প্রয়োজন" : "টিউটর";
  return `${classes} ${subjects} ${what} — ${area}, রংপুর | Baraka Tutors`;
}

export function postSeoDescription(post: Post, lang: Lang): string {
  const classes = post.classes.map((c) => classLabel(c, lang)).join(", ");
  const subjects = post.subjects.map((s) => subjectLabel(s, lang)).join(", ");
  const area = areaLabel(post.area, lang);
  if (lang === "en") {
    return post.kind === "guardian"
      ? `A guardian in ${area}, Rangpur is looking for a home tutor for ${classes} — ${subjects}. See the full tuition post and apply on Baraka Tutors.`
      : `Home tutor available in ${area}, Rangpur for ${classes} — ${subjects}. See the full tutor offer and contact them on Baraka Tutors.`;
  }
  return post.kind === "guardian"
    ? `${area}, রংপুরে ${classes}-এর জন্য ${subjects} টিউটর প্রয়োজন। পুরো টিউশন পোস্টটি দেখুন ও Baraka Tutors-এ আবেদন করুন।`
    : `${area}, রংপুরে ${classes}-এর ${subjects} হোম টিউটর পাওয়া যাচ্ছে। পুরো টিউটর অফারটি দেখুন ও Baraka Tutors-এ যোগাযোগ করুন।`;
}

/* ---------------- areas (research §3, the 9 P0/P1 areas) ---------------- */

export interface SeoArea {
  slug: string;
  bn: string;
  en: string;
  /** Spellings a post's free-text area may use (কামারপাড়া/খামারপাড়া both). */
  aliases: string[];
}

export const SEO_AREAS: SeoArea[] = [
  { slug: "dhap", bn: "ধাপ", en: "Dhap", aliases: ["ধাপ", "dhap"] },
  { slug: "lalbagh", bn: "লালবাগ", en: "Lalbagh", aliases: ["লালবাগ", "lalbag", "lalbagh"] },
  {
    slug: "modern-mor",
    bn: "মর্ডান মোড়",
    en: "Modern Mor",
    aliases: ["মর্ডান মোড়", "মডার্ন মোড়", "মর্ডান", "মডার্ন", "modern mor", "modern more"],
  },
  {
    slug: "rangpur-sadar",
    bn: "রংপুর সদর",
    en: "Rangpur Sadar",
    aliases: ["রংপুর সদর", "rangpur sadar", "সদর"],
  },
  {
    slug: "jummapara",
    bn: "জুম্মাপাড়া",
    en: "Jummapara",
    aliases: ["জুম্মাপাড়া", "jummapara", "jumma para"],
  },
  { slug: "babukha", bn: "বাবুখাঁ", en: "Babu Khan", aliases: ["বাবুখাঁ", "babu khan", "babukha"] },
  {
    slug: "shapla-chattar",
    bn: "শাপলা চত্বর",
    en: "Shapla Chattar",
    aliases: ["শাপলা চত্বর", "শাপলা", "shapla"],
  },
  { slug: "mahiganj", bn: "মাহিগঞ্জ", en: "Mahiganj", aliases: ["মাহিগঞ্জ", "mahiganj"] },
  {
    slug: "kamarpara",
    bn: "কামারপাড়া / খামারপাড়া",
    en: "Kamarpara",
    aliases: ["কামারপাড়া", "খামারপাড়া", "kamarpara", "khamarpara"],
  },
];

export function areaBySlug(slug: string): SeoArea | null {
  return SEO_AREAS.find((a) => a.slug === slug) ?? null;
}

/** A post belongs to an area page when its area text matches any alias
    (either direction, so "রংপুর সদর (অন্যান্য)" matches রংপুর সদর). */
export function postInArea(post: Post, area: SeoArea): boolean {
  const p = post.area.trim().toLowerCase();
  if (!p) return false;
  return area.aliases.some((a) => {
    const al = a.toLowerCase();
    return p.includes(al) || al.includes(p);
  });
}

export function areaTitle(area: SeoArea, lang: Lang): string {
  return lang === "en"
    ? `Home Tutors in ${area.en}, Rangpur — Baraka Tutors`
    : `${area.bn} এলাকায় হোম টিউটর — Baraka Tutors | Home Tutor in Rangpur`;
}

/* ---------------- FAQ (research §6) ---------------- */

export interface FaqEntry {
  q: Record<Lang, string>;
  a: Record<Lang, string>;
}

/** The 7 homepage questions — research GEO #1, 2, 3, 6, 10, 11, 14,
    verbatim. #14 is an English question, so it stays English in both
    modes (with an English answer), exactly as researched. */
export const HOME_FAQ: FaqEntry[] = [
  {
    q: { bn: "রংপুরে ভালো গণিতের টিউটর কিভাবে পাবো?", en: "How can I find a good Math tutor in Rangpur?" },
    a: {
      bn: "Baraka Tutors-এর বোর্ডে বিষয় ফিল্টারে “গণিত” বেছে নিলেই রংপুরের গণিত টিউটরদের পোস্ট একসঙ্গে দেখা যাবে — ধাপ, লালবাগ, মর্ডান মোড়সহ সব এলাকায়। পোস্টে টিউটরের প্রতিষ্ঠান (বেগম রোকেয়া বিশ্ববিদ্যালয়, রংপুর মেডিকেল কলেজ, কারমাইকেল কলেজ), অভিজ্ঞতা ও যাচাইকৃত ব্যাজ দেখে বেছে নিন, তারপর আবেদন করে ডেমো ক্লাস নিয়ে চূড়ান্ত করুন। SSC ও HSC গণিতের জন্য শ্রেণি ফিল্টারও ব্যবহার করা যায়।",
      en: "On the Baraka Tutors board, choose “Mathematics” in the subject filter to see Math tutors across Rangpur — Dhap, Lalbagh, Modern Mor and every other area. Check each tutor's institution (Begum Rokeya University, Rangpur Medical College, Carmichael College), experience and verified badge, then apply and take a demo class before deciding. Use the class filter for SSC and HSC Math specifically.",
    },
  },
  {
    q: { bn: "রংপুরে হোম টিউটরের মাসিক বেতন কত?", en: "How much does a home tutor charge per month in Rangpur?" },
    a: {
      bn: "রংপুরে হোম টিউটরের মাসিক বেতন আনুমানিক ৳২,৫০০ থেকে ৳৮,০০০ — Baraka Tutors-এর বর্তমান পোস্টগুলোতে এই রেঞ্জেই বেতন দেওয়া আছে। বেতন নির্ভর করে শিক্ষার্থীর শ্রেণি, বিষয়ের সংখ্যা, সপ্তাহে কত দিন পড়াবেন এবং এলাকার ওপর; অনেক পোস্টেই বেতন “আলোচনা সাপেক্ষে” থাকে। বোর্ডে প্রতিটি পোস্টের বেতন আলাদা করে লেখা থাকে, তাই নিজের এলাকা ও শ্রেণির পোস্ট দেখলেই আসল ধারণা পাওয়া যাবে।",
      en: "A home tutor in Rangpur charges approximately ৳2,500 to ৳8,000 per month — that is the salary range on Baraka Tutors' current posts. The exact fee depends on the student's class, the number of subjects, how many days a week the tutor teaches, and the area; many posts list the salary as negotiable. Every post on the board shows its own salary, so check posts for your area and class for a real figure.",
    },
  },
  {
    q: { bn: "রংপুরে ভালো টিউটর কিভাবে পাবো?", en: "What is the best way to find a good tutor in Rangpur?" },
    a: {
      bn: "সবচেয়ে ভালো উপায় হলো নিজের প্রয়োজনটা পরিষ্কার করে পোস্ট দেওয়া বা বোর্ডে খোঁজা — শ্রেণি, বিষয়, এলাকা আর শিক্ষক/শিক্ষিকা পছন্দ জানালে মিলে যাওয়া টিউটররাই সাড়া দেন। Baraka Tutors-এ গার্ডিয়ানরা বিনামূল্যে টিউশন পোস্ট দিতে পারেন, আর টিউটরদের পোস্টে প্রতিষ্ঠান, অভিজ্ঞতা ও যাচাইকৃত ব্যাজ দেখে যাচাই করা যায়। চূড়ান্ত করার আগে কথা বলে ডেমো ক্লাস নেওয়াই সবচেয়ে নিরাপদ।",
      en: "The best way is to state your requirement clearly — class, subjects, area and whether you prefer a male or female tutor — then post it or search the board, so matching tutors respond. On Baraka Tutors guardians post for free, and tutor posts show the institution, experience and a verified badge to check. Talk first and take a demo class before you finalise anyone.",
    },
  },
  {
    q: { bn: "রংপুরে মহিলা টিউটর পাওয়া যাবে কি?", en: "Can I find a female tutor in Rangpur?" },
    a: {
      bn: "হ্যাঁ, রংপুরে মহিলা টিউটর (শিক্ষিকা) পাওয়া যায় — Baraka Tutors-এর বোর্ডে লিঙ্গ ফিল্টারে “শিক্ষিকা” বেছে নিলেই শিক্ষিকাদের পোস্ট ও শিক্ষিকা চাওয়া গার্ডিয়ান পোস্টগুলো আলাদা দেখা যাবে। পোস্ট দেওয়ার সময়ও “শিক্ষিকা চাই” পছন্দ জানিয়ে দেওয়া যায়, যাতে শুধু শিক্ষিকারাই আবেদন করেন। ধাপ, লালবাগ, জুম্মাপাড়াসহ রংপুরের প্রায় সব এলাকাতেই শিক্ষিকা টিউটর আছেন।",
      en: "Yes, female tutors are available in Rangpur — on the Baraka Tutors board, set the gender filter to “Female” to see female tutors' offers and guardian posts asking for a female tutor. When you post, you can also set the preference to “Female tutor wanted” so only female tutors apply. Female tutors cover almost every area of Rangpur, including Dhap, Lalbagh and Jummapara.",
    },
  },
  {
    q: { bn: "টিউটর নেওয়ার আগে ডেমো ক্লাস নেওয়া যায় কি?", en: "Can I take a demo class before hiring a tutor?" },
    a: {
      bn: "হ্যাঁ, টিউটর চূড়ান্ত করার আগে ডেমো (ট্রায়াল) ক্লাস নেওয়া যায় এবং সেটাই করা উচিত — পড়ানোর ধরন ও শিক্ষার্থীর সঙ্গে মিল যাচাইয়ের এটাই সবচেয়ে ভালো উপায়। Baraka Tutors-এ পছন্দের পোস্টে আবেদন বা যোগাযোগ করে টিউটরের সঙ্গে কথা বলুন এবং প্রথম ক্লাসটি ডেমো হিসেবে নিতে অনুরোধ করুন; বেশিরভাগ টিউটরই এতে রাজি হন। ডেমোতে সন্তুষ্ট হলেই নিয়মিত ক্লাস ও বেতন চূড়ান্ত করুন।",
      en: "Yes, you can — and should — take a demo (trial) class before hiring a tutor; it is the best way to check the teaching style and how the tutor connects with the student. On Baraka Tutors, apply to or contact the post you like, talk to the tutor, and ask for the first class as a demo; most tutors agree. Finalise regular classes and the salary only after a demo you are happy with.",
    },
  },
  {
    q: { bn: "রংপুরে টিউটর কিভাবে যাচাই করবো?", en: "How can I verify a tutor in Rangpur?" },
    a: {
      bn: "Baraka Tutors-এ যাচাইকৃত ব্যাজওয়ালা পোস্ট মানে অ্যাডমিন টিউটরের দেওয়া প্রতিষ্ঠান ও অভিজ্ঞতার তথ্য যাচাই করেছেন — বোর্ডে এই ব্যাজ দেখেই প্রথম যাচাই হয়। এছাড়া টিউটরের প্রতিষ্ঠান (বেগম রোকেয়া বিশ্ববিদ্যালয়, রংপুর মেডিকেল কলেজ, কারমাইকেল কলেজ), পড়ানোর অভিজ্ঞতা ও বিষয় মিলিয়ে দেখুন, ফোনে কথা বলুন এবং ডেমো ক্লাস নিন। সাইটের “যাচাই” (Trust Check) পাতায় নাম বা মোবাইল নম্বর দিয়েও যাচাইকৃত টিউটর খুঁজে দেখা যায়।",
      en: "On Baraka Tutors, a post with the verified badge means the admin has checked the tutor's institution and experience information — that badge is your first check on the board. Also match the tutor's institution (Begum Rokeya University, Rangpur Medical College, Carmichael College), teaching experience and subjects, talk on the phone, and take a demo class. You can also search verified tutors by name or mobile number on the site's Trust Check page.",
    },
  },
  {
    q: {
      bn: "How much does a private tutor cost in Rangpur?",
      en: "How much does a private tutor cost in Rangpur?",
    },
    a: {
      bn: "A private home tutor in Rangpur typically costs approximately ৳2,500–8,000 per month, based on the current tuition posts on Baraka Tutors. Fees vary with the student's class (primary, SSC or HSC), the number of subjects, days per week and the area — Dhap, Lalbagh and Modern Mor posts show their own salaries on the board. Many tutors list the fee as negotiable, so check the posts for your class and area on Baraka Tutors for the most accurate figure.",
      en: "A private home tutor in Rangpur typically costs approximately ৳2,500–8,000 per month, based on the current tuition posts on Baraka Tutors. Fees vary with the student's class (primary, SSC or HSC), the number of subjects, days per week and the area — Dhap, Lalbagh and Modern Mor posts show their own salaries on the board. Many tutors list the fee as negotiable, so check the posts for your class and area on Baraka Tutors for the most accurate figure.",
    },
  },
];

/** Fee-guide page FAQ: research GEO #2, #5, #14, #17. */
export const FEES_FAQ: FaqEntry[] = [
  HOME_FAQ[1] as FaqEntry,
  {
    q: {
      bn: "রংপুরে HSC পদার্থবিজ্ঞান ও রসায়নের টিউটর কত টাকা নেন?",
      en: "How much do HSC Physics and Chemistry tutors charge in Rangpur?",
    },
    a: {
      bn: "HSC পদার্থবিজ্ঞান ও রসায়নের টিউটরদের বেতনও Baraka Tutors-এর পোস্টের সামগ্রিক রেঞ্জের মধ্যেই পড়ে — আনুমানিক ৳২,৫০০ থেকে ৳৮,০০০ প্রতি মাসে, তবে একাধিক বিষয় একসঙ্গে নিলে ও সপ্তাহে বেশি দিন পড়ালে বেতন রেঞ্জের ওপরের দিকে যায়। নির্দিষ্ট সংখ্যা পোস্টভেদে আলাদা, তাই বোর্ডে HSC ও বিষয় ফিল্টার দিয়ে বর্তমান পোস্টগুলোর বেতন দেখে নিন।",
      en: "HSC Physics and Chemistry tutors fall within the same overall range as Baraka Tutors' posts — approximately ৳2,500 to ৳8,000 per month — with fees toward the higher end when several subjects are combined or the tutor teaches more days a week. Exact figures differ by post, so filter the board by HSC and subject to see current salaries.",
    },
  },
  HOME_FAQ[6] as FaqEntry,
  {
    q: {
      bn: "How much does an HSC tutor charge in Rangpur?",
      en: "How much does an HSC tutor charge in Rangpur?",
    },
    a: {
      bn: "An HSC tutor in Rangpur charges approximately ৳2,500–8,000 per month on current Baraka Tutors posts — the same platform-wide range, with HSC science subjects (Physics, Chemistry, Higher Math, Biology) usually toward the higher end. Check the board filtered by HSC to see the exact salary on each live post.",
      en: "An HSC tutor in Rangpur charges approximately ৳2,500–8,000 per month on current Baraka Tutors posts — the same platform-wide range, with HSC science subjects (Physics, Chemistry, Higher Math, Biology) usually toward the higher end. Check the board filtered by HSC to see the exact salary on each live post.",
    },
  },
];

/** Per-area FAQ (research §6 structure: area+subject question, fee,
    female tutor, verification — 4 per area page). */
export function areaFaq(area: SeoArea): FaqEntry[] {
  return [
    {
      q: {
        bn: `${area.bn} এলাকায় গণিতের টিউটর কে আছেন?`,
        en: `Who is a Math tutor in the ${area.en} area of Rangpur?`,
      },
      a: {
        bn: `Baraka Tutors-এর বোর্ডে এলাকা “${area.bn}” আর বিষয় “গণিত” ফিল্টার করলেই ${area.bn} এলাকার গণিত টিউটরদের পোস্ট দেখা যাবে। এই পাতার নিচেও ${area.bn} এলাকার বর্তমান পোস্টগুলো দেওয়া আছে — পোস্ট না থাকলে নিজে টিউশন পোস্ট দিলে টিউটররাই আবেদন করবেন।`,
        en: `Filter the Baraka Tutors board by the ${area.en} area and the Mathematics subject to see Math tutors there. Current posts for ${area.en} are also listed below on this page — and if there is no post yet, post your requirement and tutors will apply to you.`,
      },
    },
    HOME_FAQ[1] as FaqEntry,
    HOME_FAQ[3] as FaqEntry,
    HOME_FAQ[5] as FaqEntry,
  ];
}

/* ---------------- head management ---------------- */

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export interface SeoInput {
  title: string;
  description: string;
  /** Path beginning with "/", e.g. "/post/12". */
  path: string;
  type?: "website" | "article";
}

/** Sets document.title + description + canonical + Open Graph + Twitter
    card for the current view. Called from the app on every view/language
    change, so language switches update the title too (spec P0 #1). */
export function applySeo({ title, description, path, type = "website" }: SeoInput) {
  const url = `${SITE_URL}${path}`;
  document.title = title;
  upsertMeta("name", "description", description);
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.appendChild(canonical);
  }
  canonical.setAttribute("href", url);
  upsertMeta("property", "og:title", title);
  upsertMeta("property", "og:description", description);
  upsertMeta("property", "og:type", type);
  upsertMeta("property", "og:url", url);
  upsertMeta("property", "og:image", OG_IMAGE);
  upsertMeta("property", "og:site_name", "Baraka Tutors");
  upsertMeta("name", "twitter:card", "summary");
  upsertMeta("name", "twitter:title", title);
  upsertMeta("name", "twitter:description", description);
  upsertMeta("name", "twitter:image", OG_IMAGE);
}

const JSONLD_ID = "baraka-jsonld";

/** Injects (or replaces) the page's JSON-LD block; pass null to remove.
    Accepts a single object or an array of objects (both valid JSON-LD). */
export function applyJsonLd(data: Record<string, unknown> | Record<string, unknown>[] | null) {
  const old = document.getElementById(JSONLD_ID);
  if (old) old.remove();
  if (!data) return;
  const el = document.createElement("script");
  el.id = JSONLD_ID;
  el.type = "application/ld+json";
  el.textContent = JSON.stringify(data);
  document.head.appendChild(el);
}

export function faqPageJsonLd(faq: FaqEntry[], lang: Lang): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q[lang],
      acceptedAnswer: { "@type": "Answer", text: f.a[lang] },
    })),
  };
}

export function websiteJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "Baraka Tutors",
        url: SITE_URL,
        logo: OG_IMAGE,
        description: HOME_DESC.en,
      },
      {
        "@type": "WebSite",
        name: "Baraka Tutors",
        url: SITE_URL,
        inLanguage: ["bn", "en"],
      },
    ],
  };
}
