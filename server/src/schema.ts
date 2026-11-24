// Drizzle schema for the Rangpur Tutor App.
//
// posts        — guardian tuition requests (kind='guardian') and tutor
//                offers (kind='tutor'); new posts start 'pending' until an
//                admin approves them (unless auto-approve is on).
// applications — a tutor applying to a guardian post, or a guardian
//                contacting a tutor about an offer.
// reports      — user reports against a post, handled from the admin panel.
// favorites    — posts the device owner bookmarked.
// savedSearches— named filter presets for the board.
// settings     — key/value: notice banner, auto-approve flag, admin passcode.

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: ["guardian", "tutor"] }).notNull(),
  authorName: text("author_name").notNull(),
  phone: text("phone").notNull(),
  title: text("title").notNull(),
  subjects: text("subjects").notNull().default("[]"),
  classes: text("classes").notNull().default("[]"),
  area: text("area").notNull(),
  addressNote: text("address_note").notNull().default(""),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  salaryNegotiable: integer("salary_negotiable").notNull().default(0),
  daysPerWeek: integer("days_per_week"),
  mode: text("mode", { enum: ["home", "online", "both"] })
    .notNull()
    .default("home"),
  medium: text("medium", { enum: ["bangla", "english", "both"] })
    .notNull()
    .default("bangla"),
  genderPref: text("gender_pref", { enum: ["any", "male", "female"] })
    .notNull()
    .default("any"),
  studentGender: text("student_gender", { enum: ["any", "male", "female"] })
    .notNull()
    .default("any"),
  description: text("description").notNull().default(""),
  institution: text("institution").notNull().default(""),
  experience: text("experience").notNull().default(""),
  availability: text("availability").notNull().default(""),
  status: text("status", {
    enum: ["pending", "approved", "rejected", "closed"],
  })
    .notNull()
    .default("pending"),
  featured: integer("featured").notNull().default(0),
  verified: integer("verified").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const applications = sqliteTable("applications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postId: integer("post_id").notNull(),
  applicantName: text("applicant_name").notNull(),
  applicantPhone: text("applicant_phone").notNull(),
  applicantRole: text("applicant_role", { enum: ["tutor", "guardian"] })
    .notNull()
    .default("tutor"),
  message: text("message").notNull().default(""),
  status: text("status", {
    enum: ["new", "contacted", "accepted", "rejected"],
  })
    .notNull()
    .default("new"),
  // Commission tracking (tracking only — no payment processing, and no
  // commission rate/percentage has been set by the owner, so the amount
  // starts empty and the admin fills it in). When an application becomes
  // accepted a commission record is created on it: status "pending",
  // amount NULL. The admin edits the amount and marks it paid/waived.
  commissionAmount: integer("commission_amount"),
  commissionStatus: text("commission_status", {
    enum: ["pending", "paid", "waived"],
  })
    .notNull()
    .default("pending"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const reports = sqliteTable("reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postId: integer("post_id").notNull(),
  reporterName: text("reporter_name").notNull().default(""),
  reason: text("reason").notNull(),
  details: text("details").notNull().default(""),
  status: text("status", { enum: ["open", "resolved", "dismissed"] })
    .notNull()
    .default("open"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const favorites = sqliteTable("favorites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postId: integer("post_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const savedSearches = sqliteTable("saved_searches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  filtersJson: text("filters_json").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
});

// Tutor accounts (tutors sign up and log in; guardians never do — they
// keep posting without an account).
// tutors — one row per registered tutor. passwordHash is a scrypt hash,
//   passwordSalt its random salt; plaintext passwords are never stored.
//   verified is set by the admin (0 until checked). photoUrl is an
//   optional photo URL — no file upload.
// tutorSessions — login tokens (crypto-random, 30-day expiry).
export const tutors = sqliteTable("tutors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  university: text("university").notNull().default(""),
  department: text("department").notNull().default(""),
  subjects: text("subjects").notNull().default("[]"),
  classes: text("classes").notNull().default("[]"),
  areas: text("areas").notNull().default("[]"),
  experience: text("experience").notNull().default(""),
  fees: text("fees").notNull().default(""),
  gender: text("gender", { enum: ["male", "female", "other"] })
    .notNull()
    .default("other"),
  photoUrl: text("photo_url"),
  verified: integer("verified").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const tutorSessions = sqliteTable("tutor_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  token: text("token").notNull().unique(),
  tutorId: integer("tutor_id").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Live-chat with the AI assistant.
// conversations — one thread per visitor. mode='ai' means the AI assistant
//   answers; mode='admin' means the admin has taken the chat over and the
//   AI stays silent until the admin hands it back. needsAdmin flags chats
//   the AI escalated (money, verification and other sensitive topics).
// messages — sender is 'visitor', 'ai' or 'admin'.
export const chatConversations = sqliteTable("chat_conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  visitorName: text("visitor_name").notNull().default(""),
  visitorPhone: text("visitor_phone").notNull().default(""),
  mode: text("mode", { enum: ["ai", "admin"] }).notNull().default("ai"),
  needsAdmin: integer("needs_admin").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: integer("conversation_id").notNull(),
  sender: text("sender", { enum: ["visitor", "ai", "admin"] })
    .notNull()
    .default("visitor"),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Facebook group posting (/poster).
// posterGroups — the admin's group list: one row per Facebook group, in
//   sort_order. done/doneAt track the poster's progress through the list.
// posters — poster accounts. The poster signs up with their own
//   name/phone/password; status starts 'pending' and only an admin
//   approval ('approved') makes the posting task visible. 'rejected'
//   means the admin turned the account down.
// posterSessions — login tokens (crypto-random, 30-day expiry), same
//   shape as tutorSessions.
export const posterGroups = sqliteTable("poster_groups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  done: integer("done").notNull().default(0),
  doneAt: integer("done_at", { mode: "timestamp_ms" }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const posters = sqliteTable("posters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] })
    .notNull()
    .default("pending"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const posterSessions = sqliteTable("poster_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  token: text("token").notNull().unique(),
  posterId: integer("poster_id").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
