DROP TABLE IF EXISTS entries;
--> statement-breakpoint
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  author_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  title TEXT NOT NULL,
  subjects TEXT NOT NULL DEFAULT '[]',
  classes TEXT NOT NULL DEFAULT '[]',
  area TEXT NOT NULL,
  address_note TEXT NOT NULL DEFAULT '',
  salary_min INTEGER,
  salary_max INTEGER,
  salary_negotiable INTEGER NOT NULL DEFAULT 0,
  days_per_week INTEGER,
  mode TEXT NOT NULL DEFAULT 'home',
  medium TEXT NOT NULL DEFAULT 'bangla',
  gender_pref TEXT NOT NULL DEFAULT 'any',
  student_gender TEXT NOT NULL DEFAULT 'any',
  description TEXT NOT NULL DEFAULT '',
  institution TEXT NOT NULL DEFAULT '',
  experience TEXT NOT NULL DEFAULT '',
  availability TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  featured INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  applicant_name TEXT NOT NULL,
  applicant_phone TEXT NOT NULL,
  applicant_role TEXT NOT NULL DEFAULT 'tutor',
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  reporter_name TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE saved_searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  filters_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
