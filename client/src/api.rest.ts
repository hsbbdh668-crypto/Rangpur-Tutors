// REST client for the Vercel deployment of Baraka Tutors.
//
// Mirrors the Hatch action surface (server/src/actions.ts) method for
// method, so client/src/App.tsx works unchanged, but talks to the real
// REST routes under /api/* instead of POSTing {action, args} to
// ./actions (which does not exist on Vercel).
//
// Used only under Vite (see vite.config.ts + client/vercel-shim.ts):
// the Hatch-hosted artifact keeps using client/src/api.ts with the
// @hatch/space-sdk action client. This file is never imported by the
// Hatch build.
//
// Method -> endpoint map (see also the report):
//   getConfig            GET  /api/config            (stats stripped out;
//                                                    chatAiEnabled added in api/config.ts)
//   getStats             GET  /api/config            (nested `stats` flattened)
//   listPosts            GET  /api/posts?…           (filters as query params)
//   getPost              GET  /api/posts?id=…
//   createPost           POST /api/posts
//   applyToPost          POST /api/apply
//   guardianViewApplications POST /api/apply { action: "viewApplications" }
//                        (guardian proves the post with the phone they
//                        posted with; applicant phones masked except
//                        accepted ones — no guardian login/session)
//   guardianSetApplicationStatus POST /api/apply
//                        { action: "setApplicationStatus", … } — guardian
//                        accepts/rejects on their own post (phone check)
//   reportPost           POST /api/report
//   toggleFavorite       POST /api/favorites
//   listFavorites        GET  /api/favorites
//   listFavoriteIds      GET  /api/favorites         (only favoriteIds kept)
//   saveSearch           POST /api/saved-searches
//   listSavedSearches    GET  /api/saved-searches
//   deleteSavedSearch    DELETE /api/saved-searches?id=…
//   adminVerify etc.     POST /api/admin  { action, passcode, … }
//   bootstrapAdminPasscode POST /api/admin { action: "bootstrap", newPasscode }
//                        (added to api/admin.ts — no REST equivalent existed)
//   chatStart/chatSend   POST /api/chat   { action: "start"|"send", … }
//   chatPoll             GET  /api/chat?id=…
//   tutorSignup/login    POST /api/tutors { action: "signup"|"login", … }
//   tutorMe/update       POST /api/tutors { action: "me"|"update", … }
//   adminListApplications POST /api/admin { action: "listApplications" }
//                        (full applicant phones + commission amount/status)
//   adminSetCommission   POST /api/admin { action: "setCommission", … }
//   tutorMyApplications  POST /api/tutors { action: "myApplications" }
//                        (token in the `x-tutor-token` header; a `token`
//                        body field works too. Store the token in
//                        localStorage under "baraka_tutor_token".)
//   tutorSetApplicationStatus POST /api/tutors
//                        { action: "setApplicationStatus", … } — tutor
//                        accepts/rejects on their own posts (token +
//                        post ownership). Accepting creates the commission
//                        record (status pending, amount NULL).

export interface Post {
  id: number;
  kind: "guardian" | "tutor";
  authorName: string;
  phone: string;
  title: string;
  subjects: string[];
  classes: string[];
  area: string;
  addressNote: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryNegotiable: boolean;
  daysPerWeek: number | null;
  mode: "home" | "online" | "both";
  medium: "bangla" | "english" | "both";
  genderPref: "any" | "male" | "female";
  studentGender: "any" | "male" | "female";
  description: string;
  institution: string;
  experience: string;
  availability: string;
  status: "pending" | "approved" | "rejected" | "closed";
  featured: boolean;
  verified: boolean;
  applicationCount: number;
  createdAt: string;
}

export interface ChatMessage {
  id: number;
  conversationId: number;
  sender: "visitor" | "ai" | "admin";
  body: string;
  createdAt: string;
}

export interface ChatConversation {
  id: number;
  visitorName: string;
  visitorPhone: string;
  mode: "ai" | "admin";
  needsAdmin: boolean;
  lastMessage: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminApplication {
  id: number;
  postId: number;
  postTitle: string;
  postKind: "guardian" | "tutor" | null;
  applicantName: string;
  applicantPhone: string;
  applicantRole: "tutor" | "guardian";
  message: string;
  status: "new" | "contacted" | "accepted" | "rejected";
  /** Commission amount in BDT — null means not set yet (no commission
      rate has been fixed; the admin fills it in). */
  commissionAmount: number | null;
  commissionStatus: CommissionStatus;
  createdAt: string;
}

export type CommissionStatus = "pending" | "paid" | "waived";

/** One application as a guardian sees it after the phone check:
    applicant phones masked except accepted ones (full phone shown). */
export interface GuardianApplication {
  id: number;
  applicantName: string;
  applicantRole: "tutor" | "guardian";
  applicantPhoneMasked: string;
  /** Full phone — only when this application is accepted, else null. */
  applicantPhone: string | null;
  message: string;
  status: "new" | "contacted" | "accepted" | "rejected";
  createdAt: string;
}

export interface AdminReport {
  id: number;
  postId: number;
  postTitle: string;
  reporterName: string;
  reason: string;
  details: string;
  status: "open" | "resolved" | "dismissed";
  createdAt: string;
}

export interface SavedSearchFilters {
  kind?: "guardian" | "tutor";
  query?: string;
  subject?: string;
  classLevel?: string;
  area?: string;
  mode?: "home" | "online" | "both";
  medium?: "bangla" | "english" | "both";
  gender?: "male" | "female";
  minSalary?: number;
  maxSalary?: number;
  sort?: "newest" | "salary_high" | "salary_low";
}

export interface SavedSearch {
  id: number;
  label: string;
  filters: SavedSearchFilters;
  createdAt: string;
}

/** Public tutor profile (never includes password hash/salt). */
export interface TutorProfile {
  id: number;
  name: string;
  phone: string;
  university: string;
  department: string;
  subjects: string[];
  classes: string[];
  areas: string[];
  experience: string;
  fees: string;
  gender: "male" | "female" | "other";
  photoUrl: string | null;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TutorSignupInput {
  name: string;
  phone: string;
  password: string;
  university: string;
  department: string;
  subjects: string[];
  classes: string[];
  areas: string[];
  experience?: string;
  fees?: string;
  gender: "male" | "female" | "other";
  photoUrl?: string | null;
}

export type TutorUpdateInput = Partial<
  Omit<TutorSignupInput, "password">
>;

export interface TutorApplicationSent {
  id: number;
  postId: number;
  postTitle: string;
  /** The guardian's (post author's) phone, masked (017XX-XXX123). */
  postAuthorPhoneMasked: string;
  /** Full guardian phone — only when this application is accepted. */
  postAuthorPhone: string | null;
  message: string;
  status: "new" | "contacted" | "accepted" | "rejected";
  createdAt: string;
}

export interface TutorApplicationReceived {
  id: number;
  postId: number;
  postTitle: string;
  applicantName: string;
  /** Masked on the server (e.g. 017XX-XXX123) — never the full number
      until the application is accepted. */
  applicantPhoneMasked: string;
  /** Full applicant phone — only when this application is accepted. */
  applicantPhone: string | null;
  message: string;
  status: "new" | "contacted" | "accepted" | "rejected";
  createdAt: string;
}

export interface TutorMyApplications {
  sent: TutorApplicationSent[];
  received: TutorApplicationReceived[];
}

/** localStorage key for the tutor session token (see api/tutors.ts). */
export const TUTOR_TOKEN_KEY = "baraka_tutor_token";

export interface BoardConfig {
  notice: string;
  autoApprove: boolean;
  passcodeFromEnv: boolean;
  chatAiEnabled: boolean;
}

export interface BoardStats {
  guardianPosts: number;
  tutorPosts: number;
  totalPosts: number;
  applications: number;
}

export interface AdminStats extends BoardStats {
  pending: number;
  approved: number;
  rejected: number;
  closed: number;
  newApplications: number;
  openReports: number;
  favorites: number;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body: fall through to the status check below */
  }
  if (!res.ok) {
    const message =
      data != null &&
      typeof data === "object" &&
      typeof (data as { error?: unknown }).error === "string" &&
      (data as { error: string }).error
        ? (data as { error: string }).error
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return req<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
}

// GETs the board fires twice on load (getConfig + getStats both hit
// /api/config; listFavorites + listFavoriteIds both hit /api/favorites):
// share one in-flight request so the server is only hit once per load.
const inflight = new Map<string, Promise<unknown>>();
function dedup<T>(path: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(path);
  if (existing) return existing as Promise<T>;
  const p = run();
  inflight.set(path, p);
  const clear = () => {
    if (inflight.get(path) === p) inflight.delete(path);
  };
  p.then(clear, clear);
  return p;
}

/** Builds a query string, skipping undefined / null / empty values. */
function query(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const restApi = {
  getConfig: async (_args: Record<string, never>): Promise<BoardConfig> => {
    const d = await dedup("/api/config", () =>
      req<BoardConfig & { stats: BoardStats }>("/api/config"),
    );
    return {
      notice: d.notice,
      autoApprove: d.autoApprove,
      passcodeFromEnv: d.passcodeFromEnv,
      // api/config.ts returns this; default true matches the Hatch action
      // (chat_ai_enabled !== "0") when the setting was never written.
      chatAiEnabled: d.chatAiEnabled ?? true,
    };
  },

  getStats: async (_args: Record<string, never>): Promise<BoardStats> => {
    // /api/config nests the same counts under `stats`; the Hatch action
    // returns them flat, so unwrap here.
    const d = await dedup("/api/config", () => req<{ stats: BoardStats }>("/api/config"));
    return d.stats;
  },

  listPosts: async (args: SavedSearchFilters & { limit?: number }): Promise<{ posts: Post[] }> => {
    return req<{ posts: Post[] }>(
      "/api/posts" +
        query({
          kind: args.kind,
          query: args.query,
          subject: args.subject,
          classLevel: args.classLevel,
          area: args.area,
          mode: args.mode,
          medium: args.medium,
          gender: args.gender,
          minSalary: args.minSalary,
          maxSalary: args.maxSalary,
          sort: args.sort,
          limit: args.limit,
        }),
    );
  },

  getPost: async (args: { id: number }): Promise<{ post: Post | null }> => {
    return req<{ post: Post | null }>(`/api/posts?id=${args.id}`);
  },

  createPost: async (args: {
    kind: "guardian" | "tutor";
    authorName: string;
    phone: string;
    title: string;
    subjects: string[];
    classes: string[];
    area: string;
    addressNote?: string;
    salaryMin?: number | null;
    salaryMax?: number | null;
    salaryNegotiable?: boolean;
    daysPerWeek?: number | null;
    mode?: "home" | "online" | "both";
    medium?: "bangla" | "english" | "both";
    genderPref?: "any" | "male" | "female";
    studentGender?: "any" | "male" | "female";
    description?: string;
    institution?: string;
    experience?: string;
    availability?: string;
  }): Promise<{ id: number; status: Post["status"] }> => {
    return post<{ id: number; status: Post["status"] }>("/api/posts", args);
  },

  applyToPost: async (args: {
    postId: number;
    applicantName: string;
    applicantPhone: string;
    applicantRole: "tutor" | "guardian";
    message?: string;
  }): Promise<{ id: number }> => {
    return post<{ id: number }>("/api/apply", args);
  },

  guardianViewApplications: async (args: {
    postId: number;
    phone: string;
  }): Promise<{ postTitle: string; applications: GuardianApplication[] }> => {
    return post<{ postTitle: string; applications: GuardianApplication[] }>("/api/apply", {
      action: "viewApplications",
      ...args,
    });
  },

  guardianSetApplicationStatus: async (args: {
    postId: number;
    phone: string;
    applicationId: number;
    status: "accepted" | "rejected";
  }): Promise<{ ok: boolean }> => {
    return post<{ ok: boolean }>("/api/apply", { action: "setApplicationStatus", ...args });
  },

  reportPost: async (args: {
    postId: number;
    reporterName?: string;
    reason: "wrong_info" | "spam" | "inappropriate" | "fraud" | "other";
    details?: string;
  }): Promise<{ id: number }> => {
    return post<{ id: number }>("/api/report", args);
  },

  toggleFavorite: async (args: { postId: number }): Promise<{ favorite: boolean }> => {
    return post<{ favorite: boolean }>("/api/favorites", args);
  },

  listFavorites: async (
    _args: Record<string, never>,
  ): Promise<{ posts: Post[]; favoriteIds: number[] }> => {
    return dedup("/api/favorites", () =>
      req<{ posts: Post[]; favoriteIds: number[] }>("/api/favorites"),
    );
  },

  listFavoriteIds: async (_args: Record<string, never>): Promise<{ favoriteIds: number[] }> => {
    // Same endpoint as listFavorites; only the ids are kept.
    const d = await dedup("/api/favorites", () =>
      req<{ favoriteIds: number[] }>("/api/favorites"),
    );
    return { favoriteIds: d.favoriteIds };
  },

  saveSearch: async (args: { label: string; filters: SavedSearchFilters }): Promise<{ id: number }> => {
    return post<{ id: number }>("/api/saved-searches", args);
  },

  listSavedSearches: async (
    _args: Record<string, never>,
  ): Promise<{ searches: SavedSearch[] }> => {
    return req<{ searches: SavedSearch[] }>("/api/saved-searches");
  },

  deleteSavedSearch: async (args: { id: number }): Promise<{ ok: boolean }> => {
    return req<{ ok: boolean }>(`/api/saved-searches?id=${args.id}`, { method: "DELETE" });
  },

  // ---------------- Admin (all via POST /api/admin) ----------------

  adminVerify: async (args: { passcode: string }): Promise<{ ok: boolean }> => {
    return post<{ ok: boolean }>("/api/admin", { action: "verify", ...args });
  },

  adminStats: async (args: { passcode: string }): Promise<AdminStats> => {
    return post<AdminStats>("/api/admin", { action: "stats", ...args });
  },

  adminListPosts: async (args: {
    passcode: string;
    status?: Post["status"];
    kind?: "guardian" | "tutor";
  }): Promise<{ posts: Post[] }> => {
    return post<{ posts: Post[] }>("/api/admin", { action: "listPosts", ...args });
  },

  adminSetPostStatus: async (args: {
    passcode: string;
    id: number;
    status: Post["status"];
  }): Promise<{ ok: boolean }> => {
    return post<{ ok: boolean }>("/api/admin", { action: "setPostStatus", ...args });
  },

  adminSetPostFlags: async (args: {
    passcode: string;
    id: number;
    featured?: boolean;
    verified?: boolean;
  }): Promise<{ ok: boolean }> => {
    return post<{ ok: boolean }>("/api/admin", { action: "setPostFlags", ...args });
  },

  adminUpdatePost: async (args: {
    passcode: string;
    id: number;
    title: string;
    authorName: string;
    phone: string;
    subjects: string[];
    classes: string[];
    area: string;
    addressNote: string;
    salaryMin: number | null;
    salaryMax: number | null;
    salaryNegotiable: boolean;
    daysPerWeek: number | null;
    mode: "home" | "online" | "both";
    medium: "bangla" | "english" | "both";
    genderPref: "any" | "male" | "female";
    studentGender: "any" | "male" | "female";
    description: string;
    institution: string;
    experience: string;
    availability: string;
  }): Promise<{ ok: boolean }> => {
    return post<{ ok: boolean }>("/api/admin", { action: "updatePost", ...args });
  },

  adminDeletePost: async (args: { passcode: string; id: number }): Promise<{ ok: boolean }> => {
    return post<{ ok: boolean }>("/api/admin", { action: "deletePost", ...args });
  },

  adminListApplications: async (args: {
    passcode: string;
  }): Promise<{ applications: AdminApplication[] }> => {
    return post<{ applications: AdminApplication[] }>("/api/admin", {
      action: "listApplications",
      ...args,
    });
  },

  adminSetApplicationStatus: async (args: {
    passcode: string;
    id: number;
    status: AdminApplication["status"];
  }): Promise<{ ok: boolean }> => {
    return post<{ ok: boolean }>("/api/admin", { action: "setApplicationStatus", ...args });
  },

  adminSetCommission: async (args: {
    passcode: string;
    id: number;
    amount?: number | null;
    status?: CommissionStatus;
  }): Promise<{ ok: boolean }> => {
    return post<{ ok: boolean }>("/api/admin", { action: "setCommission", ...args });
  },

  adminDeleteApplication: async (args: {
    passcode: string;
    id: number;
  }): Promise<{ ok: boolean }> => {
    return post<{ ok: boolean }>("/api/admin", { action: "deleteApplication", ...args });
  },

  adminListReports: async (args: { passcode: string }): Promise<{ reports: AdminReport[] }> => {
    return post<{ reports: AdminReport[] }>("/api/admin", { action: "listReports", ...args });
  },

  adminSetReportStatus: async (args: {
    passcode: string;
    id: number;
    status: AdminReport["status"];
  }): Promise<{ ok: boolean }> => {
    return post<{ ok: boolean }>("/api/admin", { action: "setReportStatus", ...args });
  },

  adminUpdateSettings: async (args: {
    passcode: string;
    notice?: string;
    autoApprove?: boolean;
    chatAiEnabled?: boolean;
    newPasscode?: string;
  }): Promise<{ ok: boolean }> => {
    return post<{ ok: boolean }>("/api/admin", { action: "updateSettings", ...args });
  },

  bootstrapAdminPasscode: async (args: {
    newPasscode: string;
  }): Promise<{ configured: boolean; alreadySet: boolean }> => {
    return post<{ configured: boolean; alreadySet: boolean }>("/api/admin", {
      action: "bootstrap",
      ...args,
    });
  },

  // ---------------- Live chat ----------------

  chatStart: async (args: {
    visitorName?: string;
    visitorPhone?: string;
    lang?: "bn" | "en";
  }): Promise<{ conversationId: number; aiEnabled: boolean; messages: ChatMessage[] }> => {
    return post<{ conversationId: number; aiEnabled: boolean; messages: ChatMessage[] }>(
      "/api/chat",
      { action: "start", ...args },
    );
  },

  chatSend: async (args: {
    conversationId: number;
    body: string;
    lang?: "bn" | "en";
  }): Promise<{
    messages: ChatMessage[];
    mode: "ai" | "admin";
    aiEnabled: boolean;
    needsAdmin: boolean;
  }> => {
    return post<{
      messages: ChatMessage[];
      mode: "ai" | "admin";
      aiEnabled: boolean;
      needsAdmin: boolean;
    }>("/api/chat", { action: "send", ...args });
  },

  chatPoll: async (args: { conversationId: number }): Promise<{
    messages: ChatMessage[];
    mode: "ai" | "admin";
    aiEnabled: boolean;
    needsAdmin: boolean;
  }> => {
    // Mirror the Hatch action: polling a missing conversation returns an
    // empty state instead of an error (App polls with id 0 before a chat
    // exists, and the query is disabled then — this is belt-and-suspenders).
    if (!args.conversationId) {
      return { messages: [], mode: "ai", aiEnabled: false, needsAdmin: false };
    }
    return req<{
      messages: ChatMessage[];
      mode: "ai" | "admin";
      aiEnabled: boolean;
      needsAdmin: boolean;
    }>(`/api/chat?id=${args.conversationId}`);
  },

  // ---------------- Live chat (admin inbox) ----------------

  adminChatList: async (args: {
    passcode: string;
  }): Promise<{ conversations: ChatConversation[] }> => {
    return post<{ conversations: ChatConversation[] }>("/api/admin", { action: "chatList", ...args });
  },

  adminChatGet: async (args: {
    passcode: string;
    conversationId: number;
  }): Promise<{ conversation: ChatConversation | null; messages: ChatMessage[] }> => {
    return post<{ conversation: ChatConversation | null; messages: ChatMessage[] }>("/api/admin", {
      action: "chatGet",
      ...args,
    });
  },

  adminChatReply: async (args: {
    passcode: string;
    conversationId: number;
    body: string;
  }): Promise<{ ok: boolean }> => {
    return post<{ ok: boolean }>("/api/admin", { action: "chatReply", ...args });
  },

  adminChatSetMode: async (args: {
    passcode: string;
    conversationId: number;
    mode: "ai" | "admin";
  }): Promise<{ ok: boolean }> => {
    return post<{ ok: boolean }>("/api/admin", { action: "chatSetMode", ...args });
  },

  // ---------------- Tutor accounts (POST /api/tutors) ----------------
  // Guardians have no accounts — only tutors sign up / log in. The
  // session token is sent as the `x-tutor-token` header; store it in
  // localStorage under TUTOR_TOKEN_KEY ("baraka_tutor_token") and clear
  // it on logout. signup/login return { tutor, token }; me/update
  // return { tutor }.

  tutorSignup: async (
    args: TutorSignupInput,
  ): Promise<{ tutor: TutorProfile; token: string }> => {
    return post<{ tutor: TutorProfile; token: string }>("/api/tutors", {
      action: "signup",
      ...args,
    });
  },

  tutorLogin: async (args: {
    phone: string;
    password: string;
  }): Promise<{ tutor: TutorProfile; token: string }> => {
    return post<{ tutor: TutorProfile; token: string }>("/api/tutors", {
      action: "login",
      ...args,
    });
  },

  tutorMe: async (args: { token: string }): Promise<{ tutor: TutorProfile }> => {
    return req<{ tutor: TutorProfile }>("/api/tutors", {
      method: "POST",
      headers: { "x-tutor-token": args.token },
      body: JSON.stringify({ action: "me" }),
    });
  },

  tutorUpdateProfile: async (args: TutorUpdateInput & { token: string }): Promise<{
    tutor: TutorProfile;
  }> => {
    const { token, ...fields } = args;
    return req<{ tutor: TutorProfile }>("/api/tutors", {
      method: "POST",
      headers: { "x-tutor-token": token },
      body: JSON.stringify({ action: "update", ...fields }),
    });
  },

  tutorMyApplications: async (args: { token: string }): Promise<TutorMyApplications> => {
    return req<TutorMyApplications>("/api/tutors", {
      method: "POST",
      headers: { "x-tutor-token": args.token },
      body: JSON.stringify({ action: "myApplications" }),
    });
  },

  tutorSetApplicationStatus: async (args: {
    token: string;
    applicationId: number;
    status: "contacted" | "accepted" | "rejected";
  }): Promise<{ ok: boolean }> => {
    return req<{ ok: boolean }>("/api/tutors", {
      method: "POST",
      headers: { "x-tutor-token": args.token },
      body: JSON.stringify({ action: "setApplicationStatus", ...args }),
    });
  },
};

export type RestApi = typeof restApi;
