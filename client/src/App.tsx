import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim, setFailureNoticeText } from "@hatch/space-sdk/client";
import { actionFields } from "@hatch/space-sdk/fields" with { type: "macro" };
import type { Actions } from "../../server/src/actions";
import { api, type ApiResponse } from "./api";
import {
AREAS,
CLASSES,
SUBJECTS,
REPORT_REASONS,
areaLabel,
classLabel,
fmtNum,
fullDate,
genderLabel,
mediumLabel,
modeLabel,
reportReasonLabel,
salaryText,
subjectLabel,
timeAgo,
type Post,
} from "./lib";
import { useLang, type StringKey } from "./i18n";
import {
  BOARD_TITLE,
  FEES_FAQ,
  FEES_TITLE,
  HOME_DESC,
  HOME_FAQ,
  HOME_TITLE,
  JOBS_TITLE,
  SEO_AREAS,
  applyJsonLd,
  applySeo,
  areaBySlug,
  areaFaq,
  areaTitle,
  faqPageJsonLd,
  postInArea,
  postSeoDescription,
  postSeoTitle,
  websiteJsonLd,
  type FaqEntry,
  type SeoArea,
} from "./seo";
import {
  POSTER_TOKEN_KEY,
  TUTOR_TOKEN_KEY,
  type CommissionStatus,
  type PosterGroup,
  type PosterProfile,
} from "./api.rest";
import barakaLogo from "./assets/baraka-logo.webp";
import {
  IconAlert,
  IconArrowLeft,
  IconBoard,
  IconBot,
  IconBookmark,
  IconChat,
  IconCheck,
  IconCheckCircle,
  IconClock,
  IconExternal,
  IconFacebook,
  IconGradCap,
  IconHeart,
  IconHome,
  IconInstagram,
  IconLock,
  IconMail,
  IconMegaphone,
  IconPen,
  IconPhone,
  IconPin,
  IconPlusCircle,
  IconRocket,
  IconSend,
  IconSettings,
  IconShieldCheck,
  IconSliders,
  IconStar,
  IconTrash,
  IconUser,
  IconWhatsApp,
  IconWrench,
  IconX,
} from "./icons";

const FIELDS = actionFields<typeof Actions>();

setFailureNoticeText((_error, message) => message);

type AdminStats = ApiResponse<typeof api, "adminStats">;
type AdminApplication = ApiResponse<typeof api, "adminListApplications">["applications"][number];
type AdminReport = ApiResponse<typeof api, "adminListReports">["reports"][number];
type ChatMessage = ApiResponse<typeof api, "chatPoll">["messages"][number];
type TutorProfile = ApiResponse<typeof api, "tutorMe">["tutor"];
type TutorMyApplications = ApiResponse<typeof api, "tutorMyApplications">;

type View = "home" | "board" | "post" | "favorites" | "about" | "trust" | "legal" | "signup" | "login" | "dashboard" | "area" | "fees";
type KindFilter = "all" | "guardian" | "tutor";

/* University cards on the landing page filter the board by institution.
   Aliases cover the English name and the Bangla name as tutors write it. */
const UNI_ALIASES: Record<string, string[]> = {
  "বেগম রোকেয়া বিশ্ববিদ্যালয়": ["begum rokeya", "বেগম রোকেয়া", "রোকেয়া বিশ্ববিদ্যালয়", "brur", "বেরোবি"],
  "রংপুর মেডিকেল কলেজ": ["rangpur medical", "রংপুর মেডিকেল", "রংপুর মেডিকেল কলেজ"],
  "কারমাইকেল কলেজ": ["carmichael", "কারমাইকেল"],
  "রংপুর সরকারি কলেজ": ["rangpur government college", "রংপুর সরকারি কলেজ", "rangpur govt college"],
  "রংপুর পলিটেকনিক ইনস্টিটিউট": ["rangpur polytechnic", "রংপুর পলিটেকনিক", "polytechnic"],
  "সরকারি রোকেয়া মহিলা কলেজ": ["rokeya mohila", "রোকেয়া মহিলা", "rokeya women's college", "সরকারি রোকেয়া মহিলা কলেজ"],
};

function matchesUniversity(institution: string, uniName: string): boolean {
  const hay = institution.toLowerCase();
  const aliases = UNI_ALIASES[uniName] ?? [uniName.toLowerCase()];
  return aliases.some((a) => hay.includes(a));
}

interface BoardFilters {
  kind: KindFilter;
  query: string;
  subject: string;
  classLevel: string;
  area: string;
  mode: "" | "home" | "online" | "both";
  medium: "" | "bangla" | "english" | "both";
  gender: "" | "male" | "female";
  minSalary: string;
  maxSalary: string;
  sort: "newest" | "salary_high" | "salary_low";
}

const EMPTY_FILTERS: BoardFilters = {
  kind: "all",
  query: "",
  subject: "",
  classLevel: "",
  area: "",
  mode: "",
  medium: "",
  gender: "",
  minSalary: "",
  maxSalary: "",
  sort: "newest",
};

/* ---------------- small UI helpers ---------------- */

function Chip({ children, tone = "soft" }: { children: ReactNode; tone?: "soft" | "blue" | "green" }) {
  const cls =
    tone === "blue"
      ? "bg-[var(--sky-soft)] text-[var(--sky)]"
      : tone === "green"
        ? "bg-[var(--teal-soft)] text-[var(--teal-strong)]"
        : "bg-[var(--surface-2)] text-[var(--dim)]";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

/* Gender badge: guardian posts show what teacher they want, tutor posts
   show the tutor's own gender (both stored in post.genderPref). */
function GenderChip({ post }: { post: Post }) {
  const { t } = useLang();
  if (post.kind === "guardian") {
    if (post.genderPref === "male") return <Chip>{t("wantsMaleChip")}</Chip>;
    if (post.genderPref === "female") return <Chip>{t("wantsFemaleChip")}</Chip>;
    return null;
  }
  if (post.genderPref === "male") return <Chip>{t("maleTeacherOpt")}</Chip>;
  if (post.genderPref === "female") return <Chip>{t("femaleTeacherOpt")}</Chip>;
  return null;
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-[var(--text)]">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-[var(--dim)]">{hint}</span> : null}
    </label>
  );
}

/* Headed section inside the create / admin-edit forms. Fields inside a
   section lay out in the same 1-col (mobile) / 2-col grid as the form. */
function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="sm:col-span-2">
      <h3 className="border-b border-[var(--border)] pb-1.5 text-base font-bold text-[var(--text)]">
        {title}
      </h3>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

const inputCls =
  "w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-base text-[var(--text)] outline-none focus:border-[var(--accent)]";
const selectCls = inputCls;

function ToggleChips({
  options,
  selected,
  onToggle,
  ariaLabel,
  labelOf,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  ariaLabel: string;
  labelOf?: (value: string) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={ariaLabel}>
      {options.map((opt) => {
        const on = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(opt)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              on
                ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--dim)]"
            }`}
          >
            {labelOf ? labelOf(opt) : opt}
          </button>
        );
      })}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--surface)] px-5 py-10 text-center">
      <p className="text-lg font-semibold text-[var(--text)]">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--dim)]">{body}</p>
    </div>
  );
}

/* ---------------- post card ---------------- */

function PostCard({
  post,
  isFavorite,
  onOpen,
  onToggleFavorite,
  preview,
}: {
  post: Post;
  isFavorite: boolean;
  onOpen: (post: Post) => void;
  onToggleFavorite: (post: Post) => void;
  /** Draft preview: hides the call / details / favourite actions. */
  preview?: boolean;
}) {
  const { lang, t } = useLang();
  const num = (n: number | string) => fmtNum(n, lang);
  const isGuardian = post.kind === "guardian";
  return (
    <article className="flex flex-col rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_1px_2px_rgba(30,140,200,0.06)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone={isGuardian ? "blue" : "green"}>
            {isGuardian ? (
              <>
                <IconHome className="h-3.5 w-3.5" /> {t("chipGuardian")}
              </>
            ) : (
              <>
                <IconGradCap className="h-3.5 w-3.5" /> {t("chipTutor")}
              </>
            )}
          </Chip>
          {post.featured ? <Chip tone="blue"><IconStar filled className="h-3.5 w-3.5" /> {t("chipFeatured")}</Chip> : null}
          {post.verified ? <Chip tone="green"><IconShieldCheck className="h-3.5 w-3.5" /> {t("chipVerifiedTutor")}</Chip> : null}
          <GenderChip post={post} />
        </div>
        {preview ? null : (
          <button
            type="button"
            aria-label={isFavorite ? t("favRemoveAria") : t("favAddAria")}
            aria-pressed={isFavorite}
            onClick={() => onToggleFavorite(post)}
            className="shrink-0 rounded-full p-1.5 leading-none"
          >
            {isFavorite ? (
              <IconHeart filled className="h-6 w-6 text-[var(--danger)]" />
            ) : (
              <IconHeart className="h-6 w-6 text-[var(--dim)]" />
            )}
          </button>
        )}
      </div>

      <button type="button" onClick={() => onOpen(post)} className="mt-2 text-left">
        <h3 className="text-lg font-semibold leading-snug text-[var(--text)]">{post.title}</h3>
      </button>

      <p className="mt-1 text-sm text-[var(--dim)]">
        {post.authorName}
        {post.institution ? ` · ${post.institution}` : ""} · <IconPin className="inline h-3.5 w-3.5 align-[-2px]" /> {areaLabel(post.area, lang)} · {timeAgo(post.createdAt, lang)}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {post.subjects.slice(0, 4).map((s) => (
          <Chip key={s}>{subjectLabel(s, lang)}</Chip>
        ))}
        {post.subjects.length > 4 ? <Chip>+{num(post.subjects.length - 4)}</Chip> : null}
        {post.classes.slice(0, 3).map((c) => (
          <Chip key={c}>{classLabel(c, lang)}</Chip>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--dim)]">
        <span>
          {modeLabel(post.mode, lang)}
          {post.daysPerWeek ? ` · ${t("daysWeek", { n: num(post.daysPerWeek) })}` : ""}
        </span>
        <span>{mediumLabel(post.medium, lang)}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
        <span className="text-base font-bold text-[var(--accent-strong)]">{salaryText(post, lang)}</span>
        {preview ? null : (
          <div className="flex flex-wrap items-center gap-2">
            {/* Middleman: the author's number is masked server-side
                (017XX-XXX123) and there is no direct call button — the
                full number is revealed only after an application is
                accepted. Tapping here opens the detail + apply flow. */}
            <span className="inline-flex items-center text-sm font-semibold text-[var(--dim)]">
              <IconPhone className="mr-1 inline h-4 w-4 align-[-2px]" /> {post.phone}
            </span>
            <button
              type="button"
              onClick={() => onOpen(post)}
              className="rounded-full border border-[var(--accent)] px-3.5 py-1.5 text-sm font-semibold text-[var(--accent-strong)]"
            >
              {t("applyToSeeContactBtn")}
            </button>
            <button
              type="button"
              onClick={() => onOpen(post)}
              className="rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-sm font-semibold text-white"
            >
              {t("detailsBtn")}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

/* ---------------- board ---------------- */

function Board({
  filters,
  setFilters,
  onOpen,
  institutionFilter,
  onClearInstitution,
}: {
  filters: BoardFilters;
  setFilters: (f: BoardFilters) => void;
  onOpen: (post: Post) => void;
  institutionFilter?: string | null;
  onClearInstitution?: () => void;
}) {
  const queryClient = useQueryClient();
  const { lang, t } = useLang();
  const num = (n: number | string) => fmtNum(n, lang);
  const [showFilters, setShowFilters] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [saveError, setSaveError] = useState("");

  const apiArgs = useMemo(
    () => ({
      kind: filters.kind === "all" ? undefined : filters.kind,
      query: filters.query.trim() || undefined,
      subject: filters.subject || undefined,
      classLevel: filters.classLevel || undefined,
      area: filters.area || undefined,
      mode: filters.mode || undefined,
      medium: filters.medium || undefined,
      gender: filters.gender || undefined,
      minSalary: filters.minSalary ? Number(filters.minSalary) : undefined,
      maxSalary: filters.maxSalary ? Number(filters.maxSalary) : undefined,
      sort: filters.sort,
      limit: 100,
    }),
    [filters],
  );

  const postsQuery = useQuery({
    queryKey: ["posts", apiArgs],
    queryFn: () => api.listPosts(apiArgs),
  });
  const statsQuery = useQuery({ queryKey: ["stats"], queryFn: () => api.getStats({}) });
  const configQuery = useQuery({ queryKey: ["config"], queryFn: () => api.getConfig({}) });
  const favIdsQuery = useQuery({
    queryKey: ["favoriteIds"],
    queryFn: () => api.listFavoriteIds({}),
  });
  const savedQuery = useQuery({
    queryKey: ["savedSearches"],
    queryFn: () => api.listSavedSearches({}),
  });

  const favMutation = useMutation({
    mutationFn: async (post: Post) => await api.toggleFavorite({ postId: post.id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["favoriteIds"] });
      void queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
    onError: () => setSaveError(t("genericFail")),
  });

  const saveSearchMutation = useMutation({
    mutationFn: async () =>
      await api.saveSearch({
        label: saveLabel.trim(),
        filters: {
          kind: filters.kind === "all" ? undefined : filters.kind,
          query: filters.query.trim() || undefined,
          subject: filters.subject || undefined,
          classLevel: filters.classLevel || undefined,
          area: filters.area || undefined,
          mode: filters.mode || undefined,
          medium: filters.medium || undefined,
          gender: filters.gender || undefined,
          minSalary: filters.minSalary ? Number(filters.minSalary) : undefined,
          maxSalary: filters.maxSalary ? Number(filters.maxSalary) : undefined,
          sort: filters.sort,
        },
      }),
    onSuccess: () => {
      setSaveLabel("");
      void queryClient.invalidateQueries({ queryKey: ["savedSearches"] });
    },
    onError: () => setSaveError(t("saveFail")),
  });

  const deleteSearchMutation = useMutation({
    mutationFn: async (id: number) => await api.deleteSavedSearch({ id }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["savedSearches"] }),
  });

  const favIds = new Set(favIdsQuery.data?.favoriteIds ?? []);
  const allPosts = postsQuery.data?.posts ?? [];
  /* University filter from the landing page: match the tutor's institution
     against the university's name/aliases, on the already-loaded posts. */
  const posts = institutionFilter
    ? allPosts.filter((p) => matchesUniversity(p.institution ?? "", institutionFilter))
    : allPosts;
  const activeFilterCount = [
    filters.subject,
    filters.classLevel,
    filters.area,
    filters.mode,
    filters.medium,
    filters.gender,
    filters.minSalary,
    filters.maxSalary,
  ].filter(Boolean).length;

  const kindTabs: { value: KindFilter; label: string }[] = [
    { value: "all", label: t("kindAll") },
    { value: "guardian", label: t("kindGuardian") },
    { value: "tutor", label: t("kindTutor") },
  ];

  return (
    <div>
      {/* Page H1 (SEO spec P1 #9): the board is "টিউটর খুঁজুন", the
          guardian-only board is the "টিউশন জব রংপুর" page. */}
      <h1 className="mb-4 text-2xl font-extrabold leading-tight text-[var(--text)] sm:text-3xl">
        {filters.kind === "guardian"
          ? t("boardH1Jobs")
          : filters.kind === "tutor"
            ? t("boardH1Offers")
            : t("boardH1Find")}
      </h1>
      {configQuery.data?.notice ? (
        <div className="mb-4 rounded-[var(--radius)] bg-[var(--sky-soft)] px-4 py-3 text-sm font-medium text-[var(--text)]">
          <IconMegaphone className="mr-1 inline h-4 w-4 align-[-2px]" /> {configQuery.data.notice}
        </div>
      ) : null}

      {/* Stats strip */}
      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        {[
          { n: statsQuery.data?.guardianPosts ?? 0, label: t("statGuardianPosts") },
          { n: statsQuery.data?.tutorPosts ?? 0, label: t("statTutorOffers") },
          { n: statsQuery.data?.applications ?? 0, label: t("statTotalApps") },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2 py-3"
          >
            <p className="text-xl font-bold text-[var(--accent-strong)] min-[400px]:text-2xl">{num(s.n)}</p>
            <p className="mt-0.5 text-xs text-[var(--dim)]">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3">
        <label className="sr-only" htmlFor="board-search">
          {t("searchAria")}
        </label>
        <input
          id="board-search"
          {...FIELDS.listPosts.query}
          type="search"
          value={filters.query}
          onChange={(e) => setFilters({ ...filters, query: e.target.value })}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-base text-[var(--text)] outline-none focus:border-[var(--accent)]"
        />
        <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label={t("postTypeAria")}>
          {kindTabs.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={filters.kind === t.value}
              onClick={() => setFilters({ ...filters, kind: t.value })}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                filters.kind === t.value
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface-2)] text-[var(--dim)]"
              }`}
            >
              {t.label}
            </button>
          ))}
          <button
            type="button"
            aria-expanded={showFilters}
            onClick={() => setShowFilters((v) => !v)}
            className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
          >
            <IconSliders className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("filtersBtn")}{activeFilterCount ? ` (${num(activeFilterCount)})` : ""} {showFilters ? "▲" : "▼"}
          </button>
        </div>

        {showFilters ? (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("fSubject")}>
              <select
                aria-label={t("fSubject")}
                className={selectCls}
                value={filters.subject}
                onChange={(e) => setFilters({ ...filters, subject: e.target.value })}
              >
                <option value="">{t("allSubjects")}</option>
                {SUBJECTS.map((s) => (
                  <option key={s} value={s}>
                    {subjectLabel(s, lang)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("fClass")}>
              <select
                aria-label={t("fClass")}
                className={selectCls}
                value={filters.classLevel}
                onChange={(e) => setFilters({ ...filters, classLevel: e.target.value })}
              >
                <option value="">{t("allClasses")}</option>
                {CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {classLabel(c, lang)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("fArea")}>
              <select
                aria-label={t("areaAria")}
                className={selectCls}
                value={filters.area}
                onChange={(e) => setFilters({ ...filters, area: e.target.value })}
              >
                <option value="">{t("allAreas")}</option>
                {AREAS.map((a) => (
                  <option key={a} value={a}>
                    {areaLabel(a, lang)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("fMode")}>
              <select
                aria-label={t("fMode")}
                className={selectCls}
                value={filters.mode}
                onChange={(e) =>
                  setFilters({ ...filters, mode: e.target.value as BoardFilters["mode"] })
                }
              >
                <option value="">{t("anyOpt")}</option>
                <option value="home">{t("modeHomeOpt")}</option>
                <option value="online">{t("modeOnlineOpt")}</option>
                <option value="both">{t("modeBothOpt")}</option>
              </select>
            </Field>
            <Field label={t("fMedium")}>
              <select
                aria-label={t("fMedium")}
                className={selectCls}
                value={filters.medium}
                onChange={(e) =>
                  setFilters({ ...filters, medium: e.target.value as BoardFilters["medium"] })
                }
              >
                <option value="">{t("anyMedium")}</option>
                <option value="bangla">{t("mediumBangla")}</option>
                <option value="english">{t("mediumEnglish")}</option>
                <option value="both">{t("mediumBoth")}</option>
              </select>
            </Field>
            <Field label={t("fGender")}>
              <select
                aria-label={t("fGender")}
                className={selectCls}
                value={filters.gender}
                onChange={(e) =>
                  setFilters({ ...filters, gender: e.target.value as BoardFilters["gender"] })
                }
              >
                <option value="">{t("genderAllOpt")}</option>
                <option value="male">{t("maleTeacherOpt")}</option>
                <option value="female">{t("femaleTeacherOpt")}</option>
              </select>
            </Field>
            <Field label={t("fSort")}>
              <select
                aria-label={t("fSort")}
                className={selectCls}
                value={filters.sort}
                onChange={(e) =>
                  setFilters({ ...filters, sort: e.target.value as BoardFilters["sort"] })
                }
              >
                <option value="newest">{t("sortNewest")}</option>
                <option value="salary_high">{t("sortSalaryHigh")}</option>
                <option value="salary_low">{t("sortSalaryLow")}</option>
              </select>
            </Field>
            <Field label={t("fMinSalary")}>
              <input
                {...FIELDS.listPosts.minSalary}
                aria-label={t("fMinSalary")}
                type="number"
                inputMode="numeric"
                className={inputCls}
                value={filters.minSalary}
                onChange={(e) => setFilters({ ...filters, minSalary: e.target.value })}
                placeholder={t("eg3000")}
              />
            </Field>
            <Field label={t("fMaxSalary")}>
              <input
                {...FIELDS.listPosts.maxSalary}
                aria-label={t("fMaxSalary")}
                type="number"
                inputMode="numeric"
                className={inputCls}
                value={filters.maxSalary}
                onChange={(e) => setFilters({ ...filters, maxSalary: e.target.value })}
                placeholder={t("eg8000")}
              />
            </Field>
            <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--dim)]"
              >
                {t("clearFilters")}
              </button>
              <div className="flex w-full min-w-0 flex-1 flex-col gap-2 min-[480px]:flex-row">
                <input
                  {...FIELDS.saveSearch.label}
                  aria-label={t("saveSearchNameAria")}
                  className={inputCls}
                  value={saveLabel}
                  onChange={(e) => setSaveLabel(e.target.value)}
                  placeholder={t("saveSearchPlaceholder")}
                />
                <button
                  type="button"
                  disabled={saveSearchMutation.isPending}
                  onClick={() => {
                    if (!saveLabel.trim()) {
                      setSaveError(t("errSearchName"));
                      return;
                    }
                    setSaveError("");
                    saveSearchMutation.mutate();
                  }}
                  className="shrink-0 rounded-full bg-[var(--surface-2)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
                >
                  <IconBookmark className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("saveSearchBtn")}
                </button>
              </div>
            </div>
            {saveError ? <p className="text-sm text-[var(--danger)] sm:col-span-2">{saveError}</p> : null}
          </div>
        ) : null}

        {savedQuery.data && savedQuery.data.searches.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[var(--dim)]">{t("savedSearches")}</span>
            {savedQuery.data.searches.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] py-1 pl-3 pr-1 text-sm font-medium text-[var(--accent-strong)]"
              >
                <button
                  type="button"
                  onClick={() =>
                    setFilters({
                      kind: (s.filters.kind as KindFilter | undefined) ?? "all",
                      query: s.filters.query ?? "",
                      subject: s.filters.subject ?? "",
                      classLevel: s.filters.classLevel ?? "",
                      area: s.filters.area ?? "",
                      mode: s.filters.mode ?? "",
                      medium: s.filters.medium ?? "",
                      gender: (s.filters.gender as BoardFilters["gender"] | undefined) ?? "",
                      minSalary: s.filters.minSalary != null ? String(s.filters.minSalary) : "",
                      maxSalary: s.filters.maxSalary != null ? String(s.filters.maxSalary) : "",
                      sort: s.filters.sort ?? "newest",
                    })
                  }
                >
                  {s.label}
                </button>
                <button
                  type="button"
                  aria-label={t("deleteSearchAria", { label: s.label })}
                  onClick={() => deleteSearchMutation.mutate(s.id)}
                  className="rounded-full px-1.5 text-base leading-none"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Results */}
      <div className="mt-4">
        {institutionFilter ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] py-1 pl-3 pr-1 text-sm font-medium text-[var(--accent-strong)]">
              <IconGradCap className="h-4 w-4" /> {t("uniFilterActive", { name: institutionFilter })}
              <button
                type="button"
                aria-label={t("closeAria")}
                onClick={onClearInstitution}
                className="rounded-full px-1.5 text-base leading-none"
              >
                ×
              </button>
            </span>
          </div>
        ) : null}
        {postsQuery.isPending ? (
          <p className="py-10 text-center text-[var(--dim)]">{t("loadingPosts")}</p>
        ) : postsQuery.isError ? (
          <EmptyState title={t("loadFailTitle")} body={t("loadFailBody")} />
        ) : posts.length === 0 ? (
          <EmptyState title={t("emptyPostsTitle")} body={t("emptyPostsBody")} />
        ) : (
          <>
            <p className="mb-3 text-sm text-[var(--dim)]">{t("postsFound", { n: num(posts.length) })}</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {posts.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  isFavorite={favIds.has(p.id)}
                  onOpen={onOpen}
                  onToggleFavorite={(post) => favMutation.mutate(post)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- post detail + apply + report ---------------- */

function PostDetail({
  post,
  isFavorite,
  onClose,
  onToggleFavorite,
}: {
  post: Post;
  isFavorite: boolean;
  onClose: () => void;
  onToggleFavorite: (post: Post) => void;
}) {
  const queryClient = useQueryClient();
  const [applyName, setApplyName] = useState("");
  const [applyPhone, setApplyPhone] = useState("");
  const [applyMsg, setApplyMsg] = useState("");
  const [applyError, setApplyError] = useState("");
  const [applyDone, setApplyDone] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("wrong_info");
  const [reportName, setReportName] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [reportError, setReportError] = useState("");
  const [reportDone, setReportDone] = useState(false);
  const applyRef = useRef<HTMLDivElement | null>(null);
  const { lang, t } = useLang();
  const num = (n: number | string) => fmtNum(n, lang);

  const isGuardian = post.kind === "guardian";

  const applyMutation = useMutation({
    mutationFn: async () =>
      await api.applyToPost({
        postId: post.id,
        applicantName: applyName.trim(),
        applicantPhone: applyPhone.trim(),
        applicantRole: isGuardian ? "tutor" : "guardian",
        message: applyMsg.trim(),
      }),
    onSuccess: () => {
      setApplyDone(true);
      void queryClient.invalidateQueries({ queryKey: ["posts"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: () => setApplyError(t("applyFail")),
  });

  const reportMutation = useMutation({
    mutationFn: async () =>
      await api.reportPost({
        postId: post.id,
        reporterName: reportName.trim(),
        reason: reportReason as "wrong_info" | "spam" | "inappropriate" | "fraud" | "other",
        details: reportDetails.trim(),
      }),
    onSuccess: () => setReportDone(true),
    onError: () => setReportError(t("reportFail")),
  });

  const rows: { label: string; value: string }[] = [
    {
      label: t("rowArea"),
      value: areaLabel(post.area, lang) + (post.addressNote ? ` — ${post.addressNote}` : ""),
    },
    { label: t("rowSalary"), value: salaryText(post, lang) },
    { label: t("rowMode"), value: modeLabel(post.mode, lang) },
    { label: t("rowMedium"), value: mediumLabel(post.medium, lang) },
    ...(post.daysPerWeek
      ? [{ label: t("rowPerWeek"), value: t("perWeekValue", { n: num(post.daysPerWeek) }) }]
      : []),
    ...(isGuardian
      ? [
          { label: t("rowStudent"), value: genderLabel(post.studentGender, lang) },
          { label: t("rowPrefTutor"), value: genderLabel(post.genderPref, lang) },
        ]
      : [
          ...(post.genderPref !== "any"
            ? [{ label: t("rowTutorGender"), value: genderLabel(post.genderPref, lang) }]
            : []),
          ...(post.institution ? [{ label: t("rowInstitution"), value: post.institution }] : []),
          ...(post.experience ? [{ label: t("rowExperience"), value: post.experience }] : []),
          ...(post.availability ? [{ label: t("rowTime"), value: post.availability }] : []),
        ]),
    { label: t("rowPostDate"), value: fullDate(post.createdAt, lang) },
    { label: t("rowApplications"), value: t("applicationsValue", { n: num(post.applicationCount) }) },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={post.title}
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-[var(--bg)] p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            <Chip tone={isGuardian ? "blue" : "green"}>
              {isGuardian ? (
                <>
                  <IconHome className="h-3.5 w-3.5" /> {t("chipGuardian")}
                </>
              ) : (
                <>
                  <IconGradCap className="h-3.5 w-3.5" /> {t("chipTutor")}
                </>
              )}
            </Chip>
            {post.featured ? <Chip tone="blue"><IconStar filled className="h-3.5 w-3.5" /> {t("chipFeatured")}</Chip> : null}
            {post.verified ? <Chip tone="green"><IconShieldCheck className="h-3.5 w-3.5" /> {t("chipVerifiedTutor")}</Chip> : null}
            <GenderChip post={post} />
          </div>
          <button
            type="button"
            aria-label={t("closeAria")}
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-full bg-[var(--surface-2)] p-2"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        <h2 className="mt-3 text-2xl font-bold leading-snug text-[var(--text)]">{post.title}</h2>
        <p className="mt-1 text-sm text-[var(--dim)]">
          {post.authorName} · {timeAgo(post.createdAt, lang)}
        </p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {post.subjects.map((s) => (
            <Chip key={s} tone="green">
              {subjectLabel(s, lang)}
            </Chip>
          ))}
          {post.classes.map((c) => (
            <Chip key={c}>{classLabel(c, lang)}</Chip>
          ))}
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-2">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between gap-3 text-sm">
              <dt className="shrink-0 font-medium text-[var(--dim)]">{r.label}</dt>
              <dd className="text-right font-semibold text-[var(--text)]">{r.value}</dd>
            </div>
          ))}
        </dl>

        {post.description ? (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-[var(--text)]">{t("detailsHeading")}</h3>
            <p className="mt-1 whitespace-pre-wrap text-base leading-relaxed text-[var(--text)]">
              {post.description}
            </p>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {/* Middleman: masked number only (server-side), no direct call.
              The full number is revealed only after an application is
              accepted — apply below to start that. */}
          <span className="inline-flex flex-1 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-base font-semibold text-[var(--text)]">
            <IconPhone className="mr-1 inline h-4 w-4 align-[-2px]" /> {post.phone}
          </span>
          <button
            type="button"
            onClick={() => applyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="flex-1 rounded-full bg-[var(--accent)] px-4 py-2.5 text-center text-base font-semibold text-white"
          >
            {t("applyToSeeContactBtn")}
          </button>
          <button
            type="button"
            aria-pressed={isFavorite}
            onClick={() => onToggleFavorite(post)}
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-base font-semibold text-[var(--text)]"
          >
            {isFavorite ? (
              <>
                <IconHeart filled className="mr-1 inline h-4 w-4 align-[-2px] text-[var(--danger)]" /> {t("favInBtn")}
              </>
            ) : (
              <>
                <IconHeart className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("favAddBtn")}
              </>
            )}
          </button>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-[var(--dim)]">
          <IconLock className="mr-1 inline h-3.5 w-3.5 align-[-2px]" /> {t("maskedContactNote")}
        </p>

        {/* Apply / contact */}
        <div ref={applyRef} className="mt-6 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <h3 className="text-base font-bold text-[var(--text)]">
            {isGuardian ? t("applyHeadingGuardian") : t("applyHeadingTutor")}
          </h3>
          {applyDone ? (
            <p className="mt-2 rounded-[var(--radius)] bg-[var(--accent-soft)] px-3 py-2.5 text-sm font-medium text-[var(--accent-strong)]">
              <IconCheckCircle className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("applyDoneMsg")}
            </p>
          ) : (
            <form
              className="mt-3 grid grid-cols-1 gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!applyName.trim()) return setApplyError(t("errEnterName"));
                if (!applyPhone.trim()) return setApplyError(t("errEnterPhone"));
                setApplyError("");
                applyMutation.mutate();
              }}
            >
              <Field label={t("yourName")}>
                <input
                  {...FIELDS.applyToPost.applicantName}
                  className={inputCls}
                  value={applyName}
                  onChange={(e) => setApplyName(e.target.value)}
                  placeholder={isGuardian ? t("namePhAsTutor") : t("namePhAsGuardian")}
                />
              </Field>
              <Field label={t("mobileNumber")}>
                <input
                  {...FIELDS.applyToPost.applicantPhone}
                  type="tel"
                  className={inputCls}
                  value={applyPhone}
                  onChange={(e) => setApplyPhone(e.target.value)}
                  placeholder="01XXXXXXXXX"
                />
              </Field>
              <Field label={t("messageOptional")}>
                <textarea
                  {...FIELDS.applyToPost.message}
                  className={inputCls}
                  rows={3}
                  value={applyMsg}
                  onChange={(e) => setApplyMsg(e.target.value)}
                  placeholder={isGuardian ? t("msgPhForGuardianPost") : t("msgPhForTutorPost")}
                />
              </Field>
              {applyError ? <p className="text-sm text-[var(--danger)]">{applyError}</p> : null}
              <button
                type="submit"
                disabled={applyMutation.isPending}
                className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-base font-semibold text-white disabled:opacity-60"
              >
                {applyMutation.isPending ? t("sending") : t("sendApplication")}
              </button>
            </form>
          )}
        </div>

        {/* Guardian's own applications (no account): proved by the phone
            number they posted with — see GuardianApplications below. */}
        {isGuardian ? <GuardianApplications postId={post.id} /> : null}

        {/* Report */}
        <div className="mt-4 text-center">
          {reportDone ? (
            <p className="text-sm font-medium text-[var(--accent-strong)]">
              <IconCheckCircle className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("reportDoneMsg")}
            </p>
          ) : showReport ? (
            <form
              className="grid grid-cols-1 gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 text-left"
              onSubmit={(e) => {
                e.preventDefault();
                setReportError("");
                reportMutation.mutate();
              }}
            >
              <Field label={t("reportReasonField")}>
                <select
                  aria-label={t("reportReasonField")}
                  className={selectCls}
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                >
                  {REPORT_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {lang === "en" ? r.labelEn : r.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("yourNameOptional")}>
                <input
                  {...FIELDS.reportPost.reporterName}
                  className={inputCls}
                  value={reportName}
                  onChange={(e) => setReportName(e.target.value)}
                />
              </Field>
              <Field label={t("detailsOptional")}>
                <textarea
                  {...FIELDS.reportPost.details}
                  className={inputCls}
                  rows={2}
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                />
              </Field>
              {reportError ? <p className="text-sm text-[var(--danger)]">{reportError}</p> : null}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={reportMutation.isPending}
                  className="rounded-full bg-[var(--danger)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {t("sendReport")}
                </button>
                <button
                  type="button"
                  onClick={() => setShowReport(false)}
                  className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--dim)]"
                >
                  {t("cancelBtn")}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowReport(true)}
              className="px-3 py-2 text-sm font-medium text-[var(--dim)] underline"
            >
              <IconAlert className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("reportLink")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- guardian applications (no account) ----------------
   On a guardian post's detail view: the guardian enters the phone
   number they posted with. The server checks it against the post's
   stored phone and, on a match, returns the applications — applicant
   phones masked, except the FULL number once an application is
   accepted. The guardian can accept/reject here; accepting is what
   reveals the tutor's full phone to them. No login or session. */

function GuardianApplications({ postId }: { postId: number }) {
  const { lang, t } = useLang();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [apps, setApps] = useState<ApiResponse<
    typeof api,
    "guardianViewApplications"
  >["applications"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState<number | null>(null);

  const load = async (p: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await api.guardianViewApplications({ postId, phone: p.trim() });
      setApps(res.applications);
    } catch {
      setError(t("guardianAppsWrongPhone"));
      setApps(null);
    } finally {
      setLoading(false);
    }
  };

  const setStatus = async (applicationId: number, status: "accepted" | "rejected") => {
    setActingId(applicationId);
    setError("");
    try {
      await api.guardianSetApplicationStatus({
        postId,
        phone: phone.trim(),
        applicationId,
        status,
      });
      await load(phone);
    } catch {
      setError(t("guardianAppsFail"));
    } finally {
      setActingId(null);
    }
  };

  const statusLabel = (s: "new" | "contacted" | "accepted" | "rejected") =>
    s === "new"
      ? t("appStatusNew")
      : s === "contacted"
        ? t("appStatusContacted")
        : s === "accepted"
          ? t("appStatusAccepted")
          : t("appStatusRejected");

  return (
    <div className="mt-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <h3 className="text-base font-bold text-[var(--text)]">{t("guardianAppsTitle")}</h3>
      <p className="mt-1 text-sm text-[var(--dim)]">{t("guardianAppsBody")}</p>
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!phone.trim()) return setError(t("errEnterPhone"));
          void load(phone);
        }}
      >
        <input
          {...FIELDS.guardianViewApplications.phone}
          type="tel"
          className={`${inputCls} flex-1`}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="01XXXXXXXXX"
          aria-label={t("mobileNumber")}
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? t("sending") : t("guardianAppsBtn")}
        </button>
      </form>
      {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
      {apps ? (
        apps.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--dim)]">{t("guardianAppsEmpty")}</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3">
            {apps.map((a) => (
              <article
                key={a.id}
                className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] p-3"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip tone={a.status === "new" ? "blue" : a.status === "accepted" ? "green" : "soft"}>
                    {statusLabel(a.status)}
                  </Chip>
                  <span className="ml-auto text-xs text-[var(--dim)]">{fullDate(a.createdAt, lang)}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--text)]">
                  {a.applicantName} ·{" "}
                  {a.applicantPhone ? (
                    <a
                      className="font-semibold text-[var(--accent-strong)]"
                      href={`tel:${a.applicantPhone.replace(/\s/g, "")}`}
                    >
                      {a.applicantPhone}
                    </a>
                  ) : (
                    <span className="font-semibold">{a.applicantPhoneMasked}</span>
                  )}
                </p>
                {a.message ? <p className="mt-1 text-sm text-[var(--dim)]">“{a.message}”</p> : null}
                {a.status === "accepted" ? null : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={actingId === a.id}
                      onClick={() => void setStatus(a.id, "accepted")}
                      className="rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {t("markAcceptedBtn")}
                    </button>
                    <button
                      type="button"
                      disabled={actingId === a.id}
                      onClick={() => void setStatus(a.id, "rejected")}
                      className="rounded-full border border-[var(--border)] px-3.5 py-1.5 text-sm font-semibold text-[var(--text)] disabled:opacity-60"
                    >
                      {t("markRejectedBtn")}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

/* ---------------- create post ---------------- */

function PostForm({ onDone, initialKind = "guardian", prefill }: { onDone: () => void; initialKind?: "guardian" | "tutor"; prefill?: { name: string; phone: string } | null }) {
  const { lang, t } = useLang();
  const num = (n: number | string) => fmtNum(n, lang);
  const queryClient = useQueryClient();
  const configQuery = useQuery({ queryKey: ["config"], queryFn: () => api.getConfig({}) });
  const [kind, setKind] = useState<"guardian" | "tutor">(initialKind);
  /* Logged-in tutors get their name/phone prefilled on tutor-kind posts. */
  const [authorName, setAuthorName] = useState(prefill?.name ?? "");
  const [phone, setPhone] = useState(prefill?.phone ?? "");
  const [title, setTitle] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [area, setArea] = useState("");
  const [addressNote, setAddressNote] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [negotiable, setNegotiable] = useState(false);
  const [daysPerWeek, setDaysPerWeek] = useState("");
  const [mode, setMode] = useState<"home" | "online" | "both">("home");
  const [medium, setMedium] = useState<"bangla" | "english" | "both">("bangla");
  const [genderPref, setGenderPref] = useState<"any" | "male" | "female">("any");
  const [studentGender, setStudentGender] = useState<"any" | "male" | "female">("any");
  const [description, setDescription] = useState("");
  const [institution, setInstitution] = useState("");
  const [experience, setExperience] = useState("");
  const [availability, setAvailability] = useState("");
  const [error, setError] = useState("");
  const [doneStatus, setDoneStatus] = useState<Post["status"] | null>(null);

  const toggle = (list: string[], setList: (v: string[]) => void) => (value: string) =>
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const mutation = useMutation({
    mutationFn: async () =>
      await api.createPost({
        kind,
        authorName: authorName.trim(),
        phone: phone.trim(),
        title: title.trim(),
        subjects,
        classes,
        area,
        addressNote: addressNote.trim(),
        salaryMin: salaryMin ? Number(salaryMin) : null,
        salaryMax: salaryMax ? Number(salaryMax) : null,
        salaryNegotiable: negotiable,
        daysPerWeek: daysPerWeek ? Number(daysPerWeek) : null,
        mode,
        medium,
        genderPref,
        studentGender,
        description: description.trim(),
        institution: institution.trim(),
        experience: experience.trim(),
        availability: availability.trim(),
      }),
    onSuccess: (res) => {
      setDoneStatus(res.status);
      void queryClient.invalidateQueries({ queryKey: ["posts"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: () => setError(t("postFail")),
  });

  /* Live preview: the draft post as it will look on the board. */
  const showPreview =
    authorName.trim() !== "" || title.trim() !== "" || subjects.length > 0 || classes.length > 0;
  const draftPost: Post = {
    id: 0,
    kind,
    authorName: authorName.trim(),
    phone: phone.trim(),
    title: title.trim(),
    subjects,
    classes,
    area,
    addressNote: addressNote.trim(),
    salaryMin: salaryMin ? Number(salaryMin) : null,
    salaryMax: salaryMax ? Number(salaryMax) : null,
    salaryNegotiable: negotiable,
    daysPerWeek: daysPerWeek ? Number(daysPerWeek) : null,
    mode,
    medium,
    genderPref,
    studentGender,
    description: description.trim(),
    institution: institution.trim(),
    experience: experience.trim(),
    availability: availability.trim(),
    status: "pending",
    featured: false,
    verified: false,
    applicationCount: 0,
    createdAt: new Date().toISOString(),
  };

  if (doneStatus) {
    return (
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 py-10 text-center">
        <p className="flex justify-center"><IconCheckCircle className="h-10 w-10 text-[var(--teal-strong)]" /></p>
        <h2 className="mt-3 text-xl font-bold text-[var(--text)]">{t("postDoneTitle")}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--dim)]">
          {doneStatus === "approved" ? t("postDoneApproved") : t("postDonePending")}
        </p>
        <button
          type="button"
          onClick={onDone}
          className="mt-5 rounded-full bg-[var(--accent)] px-5 py-2.5 font-semibold text-white"
        >
          {t("goToBoard")}
        </button>
      </div>
    );
  }

  return (
    <>
    <form
      className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!authorName.trim()) return setError(t("errEnterName"));
        if (!phone.trim()) return setError(t("errEnterPhone"));
        if (title.trim().length < 5) return setError(t("errTitleShort"));
        if (subjects.length === 0) return setError(t("errPickSubject"));
        if (classes.length === 0) return setError(t("errPickClass"));
        if (!area) return setError(t("errPickArea"));
        if (salaryMin && salaryMax && Number(salaryMin) > Number(salaryMax))
          return setError(t("errSalaryRange"));
        setError("");
        mutation.mutate();
      }}
    >
      <h2 className="text-xl font-bold text-[var(--text)]">{t("newPostTitle")}</h2>
      <p className="mt-1 text-sm text-[var(--dim)]">
        {configQuery.data?.autoApprove ? t("noteAutoApprove") : t("notePendingApproval")}
      </p>
      <p className="mt-1 text-sm font-medium text-[var(--dim)]">{t("requiredNote")}</p>

      <div className="mt-4 grid grid-cols-1 gap-2 min-[480px]:grid-cols-2" role="radiogroup" aria-label={t("postTypeAria")}>
        {(
          [
            { v: "guardian", label: t("iAmGuardian") },
            { v: "tutor", label: t("iAmTutor") },
          ] as const
        ).map((o) => (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={kind === o.v}
            onClick={() => setKind(o.v)}
            className={`rounded-[var(--radius)] border px-3 py-3 text-left text-sm font-semibold ${
              kind === o.v
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                : "border-[var(--border)] text-[var(--dim)]"
            }`}
          >
            {o.v === "guardian" ? <IconHome className="mr-1 inline h-4 w-4 align-[-2px]" /> : <IconGradCap className="mr-1 inline h-4 w-4 align-[-2px]" />} {o.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormSection title={t("secIdentity")}>
          <Field label={t("yourNameStar")}>
          <input
            {...FIELDS.createPost.authorName}
            className={inputCls}
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            placeholder={t("nameExample")}
          />
        </Field>
        <Field label={t("mobileStar")} hint={t("mobileHint")}>
          <input
            {...FIELDS.createPost.phone}
            type="tel"
            className={inputCls}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="01XXXXXXXXX"
          />
        </Field>
        </FormSection>
        <FormSection title={t("secSubjects")}>
          <div className="sm:col-span-2">
            <Field label={t("titleStar")}>
            <input
              {...FIELDS.createPost.title}
              className={inputCls}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === "guardian" ? t("titlePhGuardian") : t("titlePhTutor")}
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label={t("subjectsStar")}>
            <ToggleChips options={SUBJECTS} selected={subjects} onToggle={toggle(subjects, setSubjects)} ariaLabel={t("chooseSubjectsAria")} labelOf={(v) => subjectLabel(v, lang)} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label={t("classesStar")}>
            <ToggleChips options={CLASSES} selected={classes} onToggle={toggle(classes, setClasses)} ariaLabel={t("chooseClassesAria")} labelOf={(v) => classLabel(v, lang)} />
          </Field>
        </div>
        </FormSection>
        <FormSection title={t("secArea")}>
          <Field label={t("areaStar")}>
          <select aria-label={t("areaAria")} className={selectCls} value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">{t("chooseArea")}</option>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {areaLabel(a, lang)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("addressNoteLabel")}>
          <input
            {...FIELDS.createPost.addressNote}
            className={inputCls}
            value={addressNote}
            onChange={(e) => setAddressNote(e.target.value)}
            placeholder={t("addressNotePh")}
          />
        </Field>
        </FormSection>
        <FormSection title={t("secTimeSalary")}>
          <Field label={kind === "guardian" ? t("budgetMinGuardian") : t("budgetMinTutor")}>
          <input
            {...FIELDS.createPost.salaryMin}
            type="number"
            inputMode="numeric"
            className={inputCls}
            value={salaryMin}
            onChange={(e) => setSalaryMin(e.target.value)}
            placeholder="3000"
          />
        </Field>
        <Field label={kind === "guardian" ? t("budgetMaxGuardian") : t("budgetMaxTutor")}>
          <input
            {...FIELDS.createPost.salaryMax}
            type="number"
            inputMode="numeric"
            className={inputCls}
            value={salaryMax}
            onChange={(e) => setSalaryMax(e.target.value)}
            placeholder="5000"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm font-medium text-[var(--text)]">
          <input
            type="checkbox"
            className="h-5 w-5 accent-[var(--accent)]"
            checked={negotiable}
            onChange={(e) => setNegotiable(e.target.checked)}
          />
          {t("salaryNegotiable")}
        </label>
        <Field label={t("daysPerWeekLabel")}>
          <select
            aria-label={t("daysPerWeekLabel")}
            className={selectCls}
            value={daysPerWeek}
            onChange={(e) => setDaysPerWeek(e.target.value)}
          >
            <option value="">{t("notSpecified")}</option>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <option key={d} value={d}>
                {t("dayOption", { n: num(d) })}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("fMode")}>
          <select
            aria-label={t("fMode")}
            className={selectCls}
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="home">{t("modeHomeOpt")}</option>
            <option value="online">{t("modeOnlineOpt")}</option>
            <option value="both">{t("modeBothOpt")}</option>
          </select>
        </Field>
        <Field label={t("fMedium")}>
          <select
            aria-label={t("fMedium")}
            className={selectCls}
            value={medium}
            onChange={(e) => setMedium(e.target.value as typeof medium)}
          >
            <option value="bangla">{t("mediumBangla")}</option>
            <option value="english">{t("mediumEnglish")}</option>
            <option value="both">{t("mediumBoth")}</option>
          </select>
        </Field>
          {kind === "tutor" ? (
            <Field label={t("availabilityLabel")}>
              <input
                {...FIELDS.createPost.availability}
                className={inputCls}
                value={availability}
                onChange={(e) => setAvailability(e.target.value)}
                placeholder={t("availabilityPh")}
              />
            </Field>
          ) : null}
        </FormSection>
        <FormSection title={t("secGenderPref")}>
          {kind === "guardian" ? (
            <>
              <Field label={t("studentGenderLabel")}>
                <select
                  aria-label={t("studentGenderLabel")}
                  className={selectCls}
                  value={studentGender}
                  onChange={(e) => setStudentGender(e.target.value as typeof studentGender)}
                >
                  <option value="any">{t("notSpecified")}</option>
                  <option value="male">{t("maleOpt")}</option>
                  <option value="female">{t("femaleOpt")}</option>
                </select>
              </Field>
              <Field label={t("prefTutorLabel")}>
                <select
                  aria-label={t("prefTutorLabel")}
                  className={selectCls}
                  value={genderPref}
                  onChange={(e) => setGenderPref(e.target.value as typeof genderPref)}
                >
                  <option value="any">{t("anyOpt")}</option>
                  <option value="male">{t("maleTutorOpt")}</option>
                  <option value="female">{t("femaleTutorOpt")}</option>
                </select>
              </Field>
            </>
          ) : (
            <Field label={t("yourGenderLabel")}>
              <select
                aria-label={t("yourGenderLabel")}
                className={selectCls}
                value={genderPref}
                onChange={(e) => setGenderPref(e.target.value as typeof genderPref)}
              >
                <option value="any">{t("notSpecified")}</option>
                <option value="male">{t("maleOpt")}</option>
                <option value="female">{t("femaleOpt")}</option>
              </select>
            </Field>
          )}
        </FormSection>
        <FormSection title={t("secDetails")}>
          {kind === "tutor" ? (
            <>
              <Field label={t("institutionLabel")}>
                <input
                  {...FIELDS.createPost.institution}
                  className={inputCls}
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  placeholder={t("institutionPh")}
                />
              </Field>
              <Field label={t("experienceLabel")}>
                <input
                  {...FIELDS.createPost.experience}
                  className={inputCls}
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  placeholder={t("experiencePh")}
                />
              </Field>
            </>
          ) : null}
          <div className="sm:col-span-2">
            <Field label={t("descriptionLabel")}>
              <textarea
                {...FIELDS.createPost.description}
                className={inputCls}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={kind === "guardian" ? t("descPhGuardian") : t("descPhTutor")}
              />
            </Field>
          </div>
        </FormSection>
      </div>

      {error ? <p className="mt-4 text-sm font-medium text-[var(--danger)]">{error}</p> : null}
      <button
        type="submit"
        disabled={mutation.isPending}
        className="mt-5 w-full rounded-full bg-[var(--accent)] px-5 py-3 text-base font-bold text-white disabled:opacity-60 sm:w-auto"
      >
        {mutation.isPending ? t("submitting") : (<><IconPen className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("submitPostBtn")}</>)}
      </button>
    </form>

    {/* Live preview — updates as the user types. */}
    <div className="mt-5">
      <h3 className="text-base font-bold text-[var(--text)]">{t("previewTitle")}</h3>
      {showPreview ? (
        <div className="mt-2">
          <PostCard post={draftPost} isFavorite={false} onOpen={() => {}} onToggleFavorite={() => {}} preview />
        </div>
      ) : (
        <p className="mt-2 rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--dim)]">
          {t("previewEmpty")}
        </p>
      )}
    </div>
    </>
  );
}

/* ---------------- favorites ---------------- */

function Favorites({ onOpen }: { onOpen: (post: Post) => void }) {
  const { t } = useLang();
  const queryClient = useQueryClient();
  const favQuery = useQuery({ queryKey: ["favorites"], queryFn: () => api.listFavorites({}) });
  const favMutation = useMutation({
    mutationFn: async (post: Post) => await api.toggleFavorite({ postId: post.id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["favorites"] });
      void queryClient.invalidateQueries({ queryKey: ["favoriteIds"] });
    },
  });
  const posts = favQuery.data?.posts ?? [];
  if (favQuery.isPending) return <p className="py-10 text-center text-[var(--dim)]">{t("loadingShort")}</p>;
  if (posts.length === 0) {
    return (
      <EmptyState title={t("favEmptyTitle")} body={t("favEmptyBody")} />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {posts.map((p) => (
        <PostCard
          key={p.id}
          post={p}
          isFavorite
          onOpen={onOpen}
          onToggleFavorite={(post) => favMutation.mutate(post)}
        />
      ))}
    </div>
  );
}

/* ---------------- tutor accounts ---------------- */

/** Backend errors already arrive in Bengali — show them verbatim. */
function errText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

function TutorSignup({
  onAuthed,
  onGoLogin,
}: {
  onAuthed: (tutor: TutorProfile, token: string) => void;
  onGoLogin: () => void;
}) {
  const { lang, t } = useLang();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [university, setUniversity] = useState("");
  const [department, setDepartment] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [experience, setExperience] = useState("");
  const [fees, setFees] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other">("male");
  const [photoUrl, setPhotoUrl] = useState("");
  const [error, setError] = useState("");

  const toggle = (list: string[], setList: (v: string[]) => void) => (value: string) =>
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const mutation = useMutation({
    mutationFn: async () =>
      await api.tutorSignup({
        name: name.trim(),
        phone: phone.trim(),
        password,
        university: university.trim(),
        department: department.trim(),
        subjects,
        classes,
        areas,
        experience: experience.trim(),
        fees: fees.trim(),
        gender,
        photoUrl: photoUrl.trim() || null,
      }),
    onSuccess: (res) => onAuthed(res.tutor, res.token),
    onError: (e) => setError(errText(e, t("genericFail"))),
  });

  return (
    <div className="mx-auto max-w-2xl rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      <h2 className="text-xl font-bold text-[var(--text)]">
        <IconGradCap className="mr-2 inline h-5 w-5 align-[-3px] text-[var(--accent-strong)]" />
        {t("tutorSignupTitle")}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--dim)]">{t("tutorSignupSub")}</p>
      <form
        className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          mutation.mutate();
        }}
      >
        <FormSection title={t("secIdentity")}>
          <Field label={t("yourNameStar")}>
            <input
              {...FIELDS.tutorSignup.name}
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("nameExample")}
              autoComplete="name"
            />
          </Field>
          <Field label={t("mobileStar")} hint={t("mobileHint")}>
            <input
              {...FIELDS.tutorSignup.phone}
              type="tel"
              className={inputCls}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01XXXXXXXXX"
              autoComplete="tel"
            />
          </Field>
          <Field label={t("fPassword")} hint={t("passwordHint")}>
            <input
              {...FIELDS.tutorSignup.password}
              type="password"
              className={inputCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Field label={t("yourGenderLabel")}>
            <select
              aria-label={t("yourGenderLabel")}
              className={selectCls}
              value={gender}
              onChange={(e) => setGender(e.target.value as typeof gender)}
            >
              <option value="male">{t("maleOpt")}</option>
              <option value="female">{t("femaleOpt")}</option>
              <option value="other">{t("genderOtherOpt")}</option>
            </select>
          </Field>
        </FormSection>
        <FormSection title={t("secSubjects")}>
          <div className="sm:col-span-2">
            <Field label={t("subjectsStar")}>
              <ToggleChips
                options={SUBJECTS}
                selected={subjects}
                onToggle={toggle(subjects, setSubjects)}
                ariaLabel={t("chooseSubjectsAria")}
                labelOf={(v) => subjectLabel(v, lang)}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label={t("classesStar")}>
              <ToggleChips
                options={CLASSES}
                selected={classes}
                onToggle={toggle(classes, setClasses)}
                ariaLabel={t("chooseClassesAria")}
                labelOf={(v) => classLabel(v, lang)}
              />
            </Field>
          </div>
        </FormSection>
        <FormSection title={t("secArea")}>
          <div className="sm:col-span-2">
            <Field label={t("areasLabel")}>
              <ToggleChips
                options={AREAS}
                selected={areas}
                onToggle={toggle(areas, setAreas)}
                ariaLabel={t("chooseAreasAria")}
                labelOf={(v) => areaLabel(v, lang)}
              />
            </Field>
          </div>
        </FormSection>
        <FormSection title={t("secDetails")}>
          <Field label={t("universityLabel")}>
            <input
              {...FIELDS.tutorSignup.university}
              className={inputCls}
              value={university}
              onChange={(e) => setUniversity(e.target.value)}
              placeholder={t("universityPh")}
            />
          </Field>
          <Field label={t("departmentLabel")}>
            <input
              {...FIELDS.tutorSignup.department}
              className={inputCls}
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder={t("departmentPh")}
            />
          </Field>
          <Field label={t("experienceLabel")}>
            <input
              {...FIELDS.tutorSignup.experience}
              className={inputCls}
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              placeholder={t("experiencePh")}
            />
          </Field>
          <Field label={t("feesLabel")}>
            <input
              {...FIELDS.tutorSignup.fees}
              className={inputCls}
              value={fees}
              onChange={(e) => setFees(e.target.value)}
              placeholder={t("feesPh")}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t("photoUrlLabel")} hint={t("photoUrlHint")}>
              <input
                {...FIELDS.tutorSignup.photoUrl}
                type="url"
                className={inputCls}
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder="https://…"
              />
            </Field>
          </div>
        </FormSection>
        {error ? <p className="text-sm font-medium text-[var(--danger)] sm:col-span-2">{error}</p> : null}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-full bg-[var(--accent)] px-5 py-3 text-base font-bold text-white disabled:opacity-60 sm:col-span-2"
        >
          {mutation.isPending ? t("creatingAccount") : t("signupBtn")}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-[var(--dim)]">
        {t("alreadyHaveAccount")}{" "}
        <button type="button" onClick={onGoLogin} className="font-semibold text-[var(--accent-strong)] underline">
          {t("goToLoginBtn")}
        </button>
      </p>
    </div>
  );
}

function TutorLogin({
  onAuthed,
  onGoSignup,
}: {
  onAuthed: (tutor: TutorProfile, token: string) => void;
  onGoSignup: () => void;
}) {
  const { t } = useLang();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: async () =>
      await api.tutorLogin({ phone: phone.trim(), password }),
    onSuccess: (res) => onAuthed(res.tutor, res.token),
    onError: (e) => setError(errText(e, t("genericFail"))),
  });

  return (
    <div className="mx-auto max-w-md rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-6">
      <h2 className="text-xl font-bold text-[var(--text)]">
        <IconUser className="mr-2 inline h-5 w-5 align-[-3px] text-[var(--accent-strong)]" />
        {t("tutorLoginTitle")}
      </h2>
      <p className="mt-2 text-sm text-[var(--dim)]">{t("tutorLoginSub")}</p>
      <form
        className="mt-4 grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          mutation.mutate();
        }}
      >
        <Field label={t("mobileNumber")}>
          <input
            {...FIELDS.tutorLogin.phone}
            type="tel"
            className={inputCls}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="01XXXXXXXXX"
            autoComplete="tel"
          />
        </Field>
        <Field label={t("fPassword")}>
          <input
            {...FIELDS.tutorLogin.password}
            type="password"
            className={inputCls}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        {error ? <p className="text-sm font-medium text-[var(--danger)]">{error}</p> : null}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-full bg-[var(--accent)] px-5 py-2.5 font-semibold text-white disabled:opacity-60"
        >
          {mutation.isPending ? t("loggingIn") : t("loginBtn")}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-[var(--dim)]">
        {t("noAccountYet")}{" "}
        <button type="button" onClick={onGoSignup} className="font-semibold text-[var(--accent-strong)] underline">
          {t("goToSignupBtn")}
        </button>
      </p>
    </div>
  );
}

function TutorEditProfile({
  tutor,
  token,
  onDone,
  onCancel,
}: {
  tutor: TutorProfile;
  token: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { lang, t } = useLang();
  const queryClient = useQueryClient();
  const [name, setName] = useState(tutor.name);
  const [phone, setPhone] = useState(tutor.phone);
  const [university, setUniversity] = useState(tutor.university);
  const [department, setDepartment] = useState(tutor.department);
  const [subjects, setSubjects] = useState<string[]>(tutor.subjects);
  const [classes, setClasses] = useState<string[]>(tutor.classes);
  const [areas, setAreas] = useState<string[]>(tutor.areas);
  const [experience, setExperience] = useState(tutor.experience);
  const [fees, setFees] = useState(tutor.fees);
  const [gender, setGender] = useState<"male" | "female" | "other">(tutor.gender);
  const [photoUrl, setPhotoUrl] = useState(tutor.photoUrl ?? "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const toggle = (list: string[], setList: (v: string[]) => void) => (value: string) =>
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const mutation = useMutation({
    mutationFn: async () =>
      await api.tutorUpdateProfile({
        token,
        name: name.trim(),
        phone: phone.trim(),
        university: university.trim(),
        department: department.trim(),
        subjects,
        classes,
        areas,
        experience: experience.trim(),
        fees: fees.trim(),
        gender,
        photoUrl: photoUrl.trim() || null,
      }),
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ["tutorMe"] });
      onDone();
    },
    onError: (e) => setError(errText(e, t("genericFail"))),
  });

  return (
    <form
      className="mt-4 grid grid-cols-1 gap-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-2 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        mutation.mutate();
      }}
    >
      <FormSection title={t("secIdentity")}>
        <Field label={t("yourNameStar")}>
          <input
            {...FIELDS.tutorUpdateProfile.name}
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={t("mobileStar")}>
          <input
            {...FIELDS.tutorUpdateProfile.phone}
            type="tel"
            className={inputCls}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="01XXXXXXXXX"
          />
        </Field>
        <Field label={t("yourGenderLabel")}>
          <select
            aria-label={t("yourGenderLabel")}
            className={selectCls}
            value={gender}
            onChange={(e) => setGender(e.target.value as typeof gender)}
          >
            <option value="male">{t("maleOpt")}</option>
            <option value="female">{t("femaleOpt")}</option>
            <option value="other">{t("genderOtherOpt")}</option>
          </select>
        </Field>
        <Field label={t("photoUrlLabel")} hint={t("photoUrlHint")}>
          <input
            {...FIELDS.tutorUpdateProfile.photoUrl}
            type="url"
            className={inputCls}
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            placeholder="https://…"
          />
        </Field>
      </FormSection>
      <FormSection title={t("secSubjects")}>
        <div className="sm:col-span-2">
          <Field label={t("subjectsStar")}>
            <ToggleChips
              options={SUBJECTS}
              selected={subjects}
              onToggle={toggle(subjects, setSubjects)}
              ariaLabel={t("chooseSubjectsAria")}
              labelOf={(v) => subjectLabel(v, lang)}
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label={t("classesStar")}>
            <ToggleChips
              options={CLASSES}
              selected={classes}
              onToggle={toggle(classes, setClasses)}
              ariaLabel={t("chooseClassesAria")}
              labelOf={(v) => classLabel(v, lang)}
            />
          </Field>
        </div>
      </FormSection>
      <FormSection title={t("secArea")}>
        <div className="sm:col-span-2">
          <Field label={t("areasLabel")}>
            <ToggleChips
              options={AREAS}
              selected={areas}
              onToggle={toggle(areas, setAreas)}
              ariaLabel={t("chooseAreasAria")}
              labelOf={(v) => areaLabel(v, lang)}
            />
          </Field>
        </div>
      </FormSection>
      <FormSection title={t("secDetails")}>
        <Field label={t("universityLabel")}>
          <input
            {...FIELDS.tutorUpdateProfile.university}
            className={inputCls}
            value={university}
            onChange={(e) => setUniversity(e.target.value)}
            placeholder={t("universityPh")}
          />
        </Field>
        <Field label={t("departmentLabel")}>
          <input
            {...FIELDS.tutorUpdateProfile.department}
            className={inputCls}
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder={t("departmentPh")}
          />
        </Field>
        <Field label={t("experienceLabel")}>
          <input
            {...FIELDS.tutorUpdateProfile.experience}
            className={inputCls}
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
            placeholder={t("experiencePh")}
          />
        </Field>
        <Field label={t("feesLabel")}>
          <input
            {...FIELDS.tutorUpdateProfile.fees}
            className={inputCls}
            value={fees}
            onChange={(e) => setFees(e.target.value)}
            placeholder={t("feesPh")}
          />
        </Field>
      </FormSection>
      {error ? <p className="text-sm font-medium text-[var(--danger)] sm:col-span-2">{error}</p> : null}
      {saved ? (
        <p className="text-sm font-medium text-[var(--accent-strong)] sm:col-span-2">
          <IconCheckCircle className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("profileSavedMsg")}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-full bg-[var(--accent)] px-5 py-2.5 font-semibold text-white disabled:opacity-60"
        >
          {mutation.isPending ? t("saving") : t("saveBtn")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-[var(--border)] px-5 py-2.5 font-semibold text-[var(--dim)]"
        >
          {t("cancelBtn")}
        </button>
      </div>
    </form>
  );
}

/** Client-side mirror of the server mask (01700123456 -> 017XX-XXX123),
    used only to match the tutor's own posts: public posts arrive with
    the phone already masked, so "My offers" compares masked forms. */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "***";
  return `${digits.slice(0, 3)}XX-XXX${digits.slice(-3)}`;
}

function TutorDashboard({
  tutor,
  token,
  onLogout,
  onOpenPost,
  onNewOffer,
}: {
  tutor: TutorProfile;
  token: string;
  onLogout: () => void;
  onOpenPost: (post: Post) => void;
  onNewOffer: () => void;
}) {
  const { lang, t } = useLang();
  const num = (n: number | string) => fmtNum(n, lang);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"profile" | "offers" | "apps">("profile");
  const [editing, setEditing] = useState(false);

  const favIdsQuery = useQuery({
    queryKey: ["favoriteIds"],
    queryFn: () => api.listFavoriteIds({}),
  });
  const favIds = new Set(favIdsQuery.data?.favoriteIds ?? []);
  const favMutation = useMutation({
    mutationFn: async (post: Post) => await api.toggleFavorite({ postId: post.id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["favoriteIds"] });
      void queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });

  const offersQuery = useQuery({
    queryKey: ["tutorOffers", tutor.phone],
    queryFn: () => api.listPosts({ kind: "tutor", limit: 100 }),
    enabled: tab === "offers",
  });
  /* "My offers" is linked by phone: the tutor's own tutor-kind posts are
     the approved posts whose phone matches the account phone. No tutor_id
     column exists — phone matching is the linkage (see report). Public
     posts arrive with the phone masked server-side, so the account
     phone is masked the same way before comparing. */
  const myOffers = (offersQuery.data?.posts ?? []).filter(
    (p) => p.phone === maskPhone(tutor.phone),
  );

  const appsQuery = useQuery({
    queryKey: ["tutorMyApplications", token],
    queryFn: () => api.tutorMyApplications({ token }),
    enabled: tab === "apps",
  });
  const apps: TutorMyApplications | undefined = appsQuery.data;

  const openPostMutation = useMutation({
    mutationFn: async (id: number) => await api.getPost({ id }),
    onSuccess: (res) => {
      if (res.post) onOpenPost(res.post);
    },
  });

  const appStatusMutation = useMutation({
    mutationFn: async (v: {
      applicationId: number;
      status: "contacted" | "accepted" | "rejected";
    }) => await api.tutorSetApplicationStatus({ token, ...v }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tutorMyApplications", token] });
    },
  });

  const appStatusLabel = (s: "new" | "contacted" | "accepted" | "rejected") =>
    s === "new"
      ? t("appStatusNew")
      : s === "contacted"
        ? t("appStatusContacted")
        : s === "accepted"
          ? t("appStatusAccepted")
          : t("appStatusRejected");

  const tabs = [
    { v: "profile" as const, label: t("tabProfile") },
    {
      v: "offers" as const,
      label: t("tabMyOffers") + (tab === "offers" ? ` (${num(myOffers.length)})` : ""),
    },
    {
      v: "apps" as const,
      label:
        t("tabMyApps") +
        (apps ? ` (${num(apps.sent.length + apps.received.length)})` : ""),
    },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-[var(--text)]">
          <IconUser className="mr-2 inline h-5 w-5 align-[-3px] text-[var(--accent-strong)]" />
          {t("tutorDashboardTitle")}
        </h2>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-full border border-[var(--border)] px-4 py-1.5 text-sm font-semibold text-[var(--dim)]"
        >
          {t("logoutBtn")}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label={t("navDashboard")}>
        {tabs.map((tb) => (
          <button
            key={tb.v}
            type="button"
            role="tab"
            aria-selected={tab === tb.v}
            onClick={() => setTab(tb.v)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              tab === tb.v ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-2)] text-[var(--dim)]"
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "profile" ? (
        <div>
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex flex-wrap items-start gap-4">
              {tutor.photoUrl ? (
                <img
                  src={tutor.photoUrl}
                  alt={tutor.name}
                  className="h-20 w-20 shrink-0 rounded-full border border-[var(--border)] object-cover"
                />
              ) : (
                <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                  <IconUser className="h-10 w-10" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="text-xl font-bold text-[var(--text)]">{tutor.name}</h3>
                <p className="mt-0.5 text-sm text-[var(--dim)]">
                  {tutor.university}
                  {tutor.department ? ` · ${tutor.department}` : ""}
                </p>
                <p className="mt-0.5 text-sm text-[var(--dim)]">
                  <IconPhone className="mr-1 inline h-4 w-4 align-[-2px]" /> {tutor.phone}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {tutor.verified ? (
                    <Chip tone="green">
                      <IconShieldCheck className="h-3.5 w-3.5" /> {t("verifiedTutorBadge")}
                    </Chip>
                  ) : (
                    <Chip tone="blue">
                      <IconClock className="h-3.5 w-3.5" /> {t("verificationPending")}
                    </Chip>
                  )}
                  <Chip>
                    {tutor.gender === "male"
                      ? t("maleTeacherOpt")
                      : tutor.gender === "female"
                        ? t("femaleTeacherOpt")
                        : t("genderOtherOpt")}
                  </Chip>
                </div>
              </div>
            </div>
            {!tutor.verified ? (
              <p className="mt-3 rounded-[var(--radius)] bg-[var(--sky-soft)] px-3 py-2.5 text-sm text-[var(--text)]">
                {t("verificationPendingNote")}
              </p>
            ) : null}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--dim)]">{t("subjectsStar")}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {tutor.subjects.map((s) => (
                    <Chip key={s}>{subjectLabel(s, lang)}</Chip>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--dim)]">{t("classesStar")}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {tutor.classes.map((c) => (
                    <Chip key={c}>{classLabel(c, lang)}</Chip>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--dim)]">{t("areasLabel")}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {tutor.areas.map((a) => (
                    <Chip key={a}>{areaLabel(a, lang)}</Chip>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--dim)]">{t("feesRowLabel")}</p>
                <p className="mt-1 text-sm font-medium text-[var(--text)]">
                  {tutor.fees || t("notSpecified")}
                </p>
                {tutor.experience ? (
                  <>
                    <p className="mt-3 text-xs font-bold uppercase tracking-wide text-[var(--dim)]">{t("experienceLabel")}</p>
                    <p className="mt-1 text-sm text-[var(--text)]">{tutor.experience}</p>
                  </>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="mt-4 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
            >
              <IconPen className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("editProfileBtn")}
            </button>
          </div>
          {editing ? (
            <TutorEditProfile
              tutor={tutor}
              token={token}
              onDone={() => setEditing(false)}
              onCancel={() => setEditing(false)}
            />
          ) : null}
        </div>
      ) : null}

      {tab === "offers" ? (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-[var(--text)]">{t("myOffersTitle")}</h3>
            <button
              type="button"
              onClick={onNewOffer}
              className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
            >
              <IconPlusCircle className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("newOfferBtn")}
            </button>
          </div>
          {offersQuery.isPending ? (
            <p className="py-8 text-center text-[var(--dim)]">{t("loadingShort")}</p>
          ) : myOffers.length === 0 ? (
            <EmptyState title={t("myOffersEmptyTitle")} body={t("myOffersEmptyBody")} />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {myOffers.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  isFavorite={favIds.has(p.id)}
                  onOpen={onOpenPost}
                  onToggleFavorite={(post) => favMutation.mutate(post)}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === "apps" ? (
        <div>
          <h3 className="mb-3 text-lg font-bold text-[var(--text)]">{t("myAppsTitle")}</h3>
          {appsQuery.isPending ? (
            <p className="py-8 text-center text-[var(--dim)]">{t("loadingShort")}</p>
          ) : appsQuery.isError ? (
            <EmptyState title={t("loadFailTitle")} body={t("loadFailBody")} />
          ) : (
            <div className="grid grid-cols-1 gap-5">
              <section>
                <h4 className="mb-2 text-base font-bold text-[var(--text)]">{t("appsSentTitle")}</h4>
                {(apps?.sent ?? []).length === 0 ? (
                  <EmptyState title={t("noSentAppsTitle")} body={t("noSentAppsBody")} />
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {(apps?.sent ?? []).map((a) => (
                      <article
                        key={a.id}
                        className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Chip tone={a.status === "new" ? "blue" : a.status === "accepted" ? "green" : "soft"}>
                            {appStatusLabel(a.status)}
                          </Chip>
                          <span className="ml-auto text-xs text-[var(--dim)]">{fullDate(a.createdAt, lang)}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => openPostMutation.mutate(a.postId)}
                          className="mt-2 text-left font-semibold text-[var(--accent-strong)] underline"
                        >
                          {a.postTitle || t("postColon")}
                        </button>
                        {/* The guardian's full phone is revealed only once
                            this application is accepted; otherwise masked. */}
                        <p className="mt-1 text-sm text-[var(--text)]">
                          {t("contactRevealedLabel")}{" "}
                          {a.postAuthorPhone ? (
                            <a
                              className="font-semibold text-[var(--accent-strong)]"
                              href={`tel:${a.postAuthorPhone.replace(/\s/g, "")}`}
                            >
                              {a.postAuthorPhone}
                            </a>
                          ) : (
                            <span className="font-semibold">{a.postAuthorPhoneMasked}</span>
                          )}
                        </p>
                        {a.message ? <p className="mt-1 text-sm text-[var(--dim)]">“{a.message}”</p> : null}
                      </article>
                    ))}
                  </div>
                )}
              </section>
              <section>
                <h4 className="mb-2 text-base font-bold text-[var(--text)]">{t("appsReceivedTitle")}</h4>
                <p className="mb-2 text-xs leading-relaxed text-[var(--dim)]">
                  <IconLock className="mr-1 inline h-3.5 w-3.5 align-[-2px]" /> {t("maskedPhoneNote")}
                </p>
                {(apps?.received ?? []).length === 0 ? (
                  <EmptyState title={t("noReceivedAppsTitle")} body={t("noReceivedAppsBody")} />
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {(apps?.received ?? []).map((a) => (
                      <article
                        key={a.id}
                        className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Chip tone={a.status === "new" ? "blue" : a.status === "accepted" ? "green" : "soft"}>
                            {appStatusLabel(a.status)}
                          </Chip>
                          <span className="ml-auto text-xs text-[var(--dim)]">{fullDate(a.createdAt, lang)}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => openPostMutation.mutate(a.postId)}
                          className="mt-2 text-left font-semibold text-[var(--accent-strong)] underline"
                        >
                          {a.postTitle || t("postColon")}
                        </button>
                        <p className="mt-1 text-sm text-[var(--text)]">
                          {t("applicantColon")} {a.applicantName} ·{" "}
                          {a.applicantPhone ? (
                            <a
                              className="font-semibold text-[var(--accent-strong)]"
                              href={`tel:${a.applicantPhone.replace(/\s/g, "")}`}
                            >
                              {a.applicantPhone}
                            </a>
                          ) : (
                            <span className="font-semibold">{a.applicantPhoneMasked}</span>
                          )}
                        </p>
                        {a.message ? <p className="mt-1 text-sm text-[var(--dim)]">“{a.message}”</p> : null}
                        {a.status !== "accepted" && a.status !== "rejected" ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={appStatusMutation.isPending}
                              onClick={() =>
                                appStatusMutation.mutate({ applicationId: a.id, status: "accepted" })
                              }
                              className="rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                            >
                              {t("markAcceptedBtn")}
                            </button>
                            <button
                              type="button"
                              disabled={appStatusMutation.isPending}
                              onClick={() =>
                                appStatusMutation.mutate({ applicationId: a.id, status: "rejected" })
                              }
                              className="rounded-full border border-[var(--border)] px-3.5 py-1.5 text-sm font-semibold text-[var(--text)] disabled:opacity-60"
                            >
                              {t("markRejectedBtn")}
                            </button>
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- admin commission editor ----------------
   Shown on accepted applications in the admin inbox. Commission is
   tracking only — no rate is set anywhere, so the amount starts empty
   and the admin fills it in, then marks it paid or waived. */

function CommissionEditor({
  application,
  passcode,
  onSaved,
}: {
  application: AdminApplication;
  passcode: string;
  onSaved: () => void;
}) {
  const { t } = useLang();
  const [amount, setAmount] = useState(application.commissionAmount?.toString() ?? "");
  const [status, setStatus] = useState<CommissionStatus>(application.commissionStatus);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: async () =>
      await api.adminSetCommission({
        passcode,
        id: application.id,
        amount: amount.trim() === "" ? null : Number(amount),
        status,
      }),
    onSuccess: () => {
      setSaved(true);
      setError("");
      onSaved();
    },
    onError: () => {
      setSaved(false);
      setError(t("commissionSaveFail"));
    },
  });

  return (
    <div className="mt-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <p className="text-sm font-bold text-[var(--text)]">{t("commissionLabel")}</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          {...FIELDS.adminSetCommission.amount}
          type="number"
          inputMode="numeric"
          aria-label={t("commissionAmountPh")}
          placeholder={t("commissionAmountPh")}
          className={`${inputCls} flex-1`}
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setSaved(false);
          }}
        />
        <select
          aria-label={t("commissionLabel")}
          className={selectCls}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as CommissionStatus);
            setSaved(false);
          }}
        >
          <option value="pending">{t("commissionPending")}</option>
          <option value="paid">{t("commissionPaid")}</option>
          <option value="waived">{t("commissionWaived")}</option>
        </select>
        <button
          type="button"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
          className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {t("saveBtn")}
        </button>
      </div>
      {amount.trim() === "" && !saved ? (
        <p className="mt-1.5 text-xs text-[var(--dim)]">{t("commissionNotSet")}</p>
      ) : null}
      {saved ? (
        <p className="mt-1.5 text-xs font-medium text-[var(--accent-strong)]">{t("commissionSaved")}</p>
      ) : null}
      {error ? <p className="mt-1.5 text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

/* ---------------- Facebook group posting (/poster) ----------------
   Standalone route like /admin: renders ONLY this panel, no public
   header/board/footer/chat. The poster signs up with their own
   name/phone/password and CAN log in, but sees NO task until an admin
   approves the account — until then they only see the waiting message.
   Approved posters see ALL groups at once, each with its own
   "কপি ও খুলুন" button: one click opens the group's Facebook URL
   AND copies the post text. The button never disappears — any group
   can be posted any time, as many times as wanted. After a copy that
   button shows "কপি হয়েছে" until another group is copied. Each row
   also has a small "পোস্ট হয়েছে" control that marks that group done
   for the admin's done/remaining tracking. */

// Copy helper: Clipboard API first, then the synchronous textarea +
// execCommand fallback for mobile browsers where the async API fails
// (older WebViews, non-secure contexts, or after the page loses
// focus). Returns true only when the text is actually on the
// clipboard.
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fall through to the fallback below
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function PosterPanel() {
  const { lang, t, setLang } = useLang();
  const queryClient = useQueryClient();
  const [token, setToken] = useState(() => localStorage.getItem(POSTER_TOKEN_KEY) ?? "");
  const [poster, setPoster] = useState<PosterProfile | null>(null);
  const [statusTick, setStatusTick] = useState(0);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [taskError, setTaskError] = useState("");
  // Which group's button currently shows "কপি হয়েছে" — it stays there
  // until another group is copied (no timer; a refresh clears it).
  const [copiedGroupId, setCopiedGroupId] = useState<number | null>(null);
  const [copyFailedGroupId, setCopyFailedGroupId] = useState<number | null>(null);
  const [textCopied, setTextCopied] = useState(false);
  const [textCopyFailed, setTextCopyFailed] = useState(false);

  // Restore the session from the saved token (and re-check the approval
  // status when the poster taps "check status again").
  useEffect(() => {
    if (!token) {
      setPoster(null);
      return;
    }
    let alive = true;
    api
      .posterMe({ token })
      .then((res) => {
        if (alive) setPoster(res.poster);
      })
      .catch(() => {
        if (!alive) return;
        localStorage.removeItem(POSTER_TOKEN_KEY);
        setToken("");
        setPoster(null);
      });
    return () => {
      alive = false;
    };
  }, [token, statusTick]);

  const taskQuery = useQuery({
    queryKey: ["posterTask", token],
    queryFn: async () => await api.posterGet({ token }),
    enabled: !!token && poster?.status === "approved",
    retry: false,
  });

  const authMutation = useMutation({
    mutationFn: async () =>
      authMode === "login"
        ? await api.posterLogin({ phone, password })
        : await api.posterSignup({ name, phone, password }),
    onSuccess: (res) => {
      localStorage.setItem(POSTER_TOKEN_KEY, res.token);
      setToken(res.token);
      setPoster(res.poster);
      setAuthError("");
      setName("");
      setPassword("");
    },
    onError: (e) => setAuthError(e instanceof Error ? e.message : t("failedShort")),
  });

  const completeMutation = useMutation({
    mutationFn: async (groupId: number) => await api.posterComplete({ token, groupId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["posterTask"] });
      setTaskError("");
    },
    onError: (e) => setTaskError(e instanceof Error ? e.message : t("failedShort")),
  });

  const logout = () => {
    localStorage.removeItem(POSTER_TOKEN_KEY);
    setToken("");
    setPoster(null);
    setCopiedGroupId(null);
    setCopyFailedGroupId(null);
    setTextCopied(false);
    setTextCopyFailed(false);
  };

  const task = taskQuery.data;

  // One click does BOTH: copy FIRST, then open the group. Copying
  // first matters — once window.open runs, the page loses focus (on
  // phones the browser jumps to the Facebook app/tab) and the
  // clipboard write fails because it needs the user gesture and a
  // focused document. The "কপি হয়েছে" mark is set only when the
  // copy really succeeded. The button never disappears — the mark
  // stays on this group until another group is copied.
  const openGroup = async (g: PosterGroup) => {
    setCopyFailedGroupId(null);
    if (task?.postText) {
      const copied = await copyText(task.postText);
      if (copied) {
        setCopiedGroupId(g.id);
      } else {
        if (copiedGroupId === g.id) setCopiedGroupId(null);
        setCopyFailedGroupId(g.id);
      }
    } else {
      setCopyFailedGroupId(g.id);
    }
    window.open(g.url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <img src={barakaLogo} alt="Baraka Tutors" className="h-9 w-9 rounded-xl object-cover" />
          <div>
            <h1 className="text-lg font-bold leading-tight text-[var(--text)]">{t("posterTitle")}</h1>
            <p className="text-xs text-[var(--dim)]">{t("posterTitleSub")}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setLang(lang === "bn" ? "en" : "bn")}
          className="rounded-full border border-[var(--border)] px-3 py-1.5 text-sm font-semibold text-[var(--dim)]"
        >
          {lang === "bn" ? "English" : "বাংলা"}
        </button>
      </div>

      {!poster ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="mb-1 text-base font-bold text-[var(--text)]">
            {authMode === "login" ? t("posterLoginTitle") : t("posterSignupTitle")}
          </h2>
          {authMode === "signup" ? (
            <p className="mb-3 text-sm text-[var(--dim)]">{t("posterSignupHint")}</p>
          ) : null}
          {authMode === "signup" ? (
            <label className="mb-3 block">
              <span className="mb-1 block text-sm font-semibold text-[var(--text)]">{t("posterNameLabel")}</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)]"
              />
            </label>
          ) : null}
          <label className="mb-3 block">
            <span className="mb-1 block text-sm font-semibold text-[var(--text)]">{t("posterPhoneLabel")}</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="01XXXXXXXXX"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)]"
            />
          </label>
          <label className="mb-3 block">
            <span className="mb-1 block text-sm font-semibold text-[var(--text)]">{t("posterPasswordLabel")}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)]"
            />
          </label>
          {authError ? <p className="mb-3 text-sm text-[var(--danger)]">{authError}</p> : null}
          <button
            type="button"
            disabled={authMutation.isPending}
            onClick={() => authMutation.mutate()}
            className="w-full rounded-xl bg-[var(--accent)] px-4 py-2.5 font-bold text-white disabled:opacity-60"
          >
            {authMode === "login" ? t("posterLoginBtn") : t("posterSignupBtn")}
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMode(authMode === "login" ? "signup" : "login");
              setAuthError("");
            }}
            className="mt-2 w-full rounded-xl px-4 py-2 text-sm font-semibold text-[var(--accent-strong)]"
          >
            {authMode === "login" ? t("posterToSignup") : t("posterToLogin")}
          </button>
        </div>
      ) : poster.status !== "approved" ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 text-center">
          <IconClock className="mx-auto mb-2 h-10 w-10 text-[var(--accent-strong)]" />
          <h2 className="mb-1 text-base font-bold text-[var(--text)]">
            {poster.status === "rejected" ? t("posterRejectedTitle") : t("posterWaitingTitle")}
          </h2>
          <p className="mb-1 text-sm text-[var(--dim)]">
            {poster.status === "rejected" ? t("posterRejectedBody") : t("posterWaitingBody")}
          </p>
          <p className="mb-3 text-sm font-semibold text-[var(--text)]">{poster.name} · {poster.phone}</p>
          {poster.status === "pending" ? (
            <button
              type="button"
              onClick={() => setStatusTick((n) => n + 1)}
              className="rounded-xl bg-[var(--accent)] px-4 py-2 font-bold text-white"
            >
              {t("posterCheckStatusBtn")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={logout}
            className="ml-2 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--dim)]"
          >
            {t("posterLogoutBtn")}
          </button>
        </div>
      ) : taskQuery.isPending ? (
        <p className="py-10 text-center text-[var(--dim)]">{t("loadingShort")}</p>
      ) : taskQuery.isError ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 text-center">
          <p className="mb-3 text-sm text-[var(--danger)]">
            {taskQuery.error instanceof Error ? taskQuery.error.message : t("failedShort")}
          </p>
          <button
            type="button"
            onClick={logout}
            className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--dim)]"
          >
            {t("posterLogoutBtn")}
          </button>
        </div>
      ) : task ? (
        <div>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-[var(--text)]">
              {t("posterProgress", { done: String(task.doneCount), total: String(task.totalCount) })}
            </p>
            <button
              type="button"
              onClick={logout}
              className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold text-[var(--dim)]"
            >
              {t("posterLogoutBtn")}
            </button>
          </div>

          <div className="mb-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="mb-1 text-sm font-bold text-[var(--text)]">{t("posterHowTitle")}</h2>
            <p className="text-sm text-[var(--dim)]">{t("posterHowBody")}</p>
          </div>

          {task.postText ? (
            <div className="mb-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-[var(--text)]">{t("posterPostTextLabel")}</h2>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await copyText(task.postText);
                    setTextCopied(ok);
                    setTextCopyFailed(!ok);
                  }}
                  className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-semibold text-[var(--accent-strong)]"
                >
                  {t("posterCopyTextBtn")}
                </button>
              </div>
              <p className="select-text whitespace-pre-wrap text-sm text-[var(--text)]">{task.postText}</p>
              {textCopied ? <p className="mt-2 text-sm font-semibold text-[var(--accent-strong)]">{t("posterCopiedMsg")}</p> : null}
              {textCopyFailed ? <p className="mt-2 text-sm text-[var(--danger)]">{t("posterCopyFailMsg")}</p> : null}
            </div>
          ) : (
            <p className="mb-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--dim)]">
              {t("posterNoTextBody")}
            </p>
          )}

          {task.groups.length > 0 ? (
            <div className="space-y-2">
              {task.groups.map((g) => {
                const justCopied = copiedGroupId === g.id;
                return (
                  <div
                    key={g.id}
                    className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h2 className="min-w-0 truncate text-sm font-bold text-[var(--text)]">{g.name}</h2>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          g.done ? "bg-[var(--surface-2)] text-[var(--accent-strong)]" : "bg-[var(--surface-2)] text-[var(--dim)]"
                        }`}
                      >
                        {g.done ? t("posterGroupDoneChip") : t("posterGroupPendingChip")}
                      </span>
                    </div>
                    <p className="mb-3 break-all text-xs text-[var(--dim)]">{g.url}</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void openGroup(g)}
                        className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white ${
                          justCopied ? "bg-[var(--accent-strong)]" : "bg-[var(--accent)]"
                        }`}
                      >
                        {justCopied ? <IconCheck className="h-5 w-5" /> : <IconExternal className="h-5 w-5" />}
                        {justCopied ? t("posterCopiedBtn") : t("posterCopyOpenBtn")}
                      </button>
                      {g.done ? null : (
                        <button
                          type="button"
                          disabled={completeMutation.isPending}
                          onClick={() => completeMutation.mutate(g.id)}
                          className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[var(--accent)] px-3 py-2.5 text-sm font-bold text-[var(--accent-strong)] disabled:opacity-60"
                        >
                          <IconCheck className="h-4 w-4" /> {t("posterDoneBtn")}
                        </button>
                      )}
                    </div>
                    {copyFailedGroupId === g.id ? (
                      <p className="mt-2 text-sm text-[var(--danger)]">{t("posterCopyFailMsg")}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
              <h2 className="mb-1 text-base font-bold text-[var(--text)]">{t("posterNoGroupsTitle")}</h2>
              <p className="text-sm text-[var(--dim)]">{t("posterNoGroupsBody")}</p>
            </div>
          )}
          {taskError ? <p className="mt-3 text-sm text-[var(--danger)]">{taskError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/* Admin side of group posting: post text, group list, progress reset
   and poster-account approval — inside the passcode-protected admin
   panel only. The poster page link is shown here so the admin can
   share it with the poster; it appears nowhere on the public site. */

function AdminPoster({ passcode }: { passcode: string }) {
  const { lang, t } = useLang();
  const num = (n: number | string) => fmtNum(n, lang);
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [textSaved, setTextSaved] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupUrl, setGroupUrl] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<number | null>(null);
  const [confirmDeleteAccountId, setConfirmDeleteAccountId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const textInit = useRef(false);

  const listQuery = useQuery({
    queryKey: ["adminPosterList", passcode],
    queryFn: async () => await api.adminPosterList({ passcode }),
  });
  const accountsQuery = useQuery({
    queryKey: ["adminPosterAccounts", passcode],
    queryFn: async () => await api.adminPosterListAccounts({ passcode }),
  });

  useEffect(() => {
    if (listQuery.data && !textInit.current) {
      setText(listQuery.data.postText);
      textInit.current = true;
    }
  }, [listQuery.data]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["adminPosterList"] });
    void queryClient.invalidateQueries({ queryKey: ["adminPosterAccounts"] });
  };

  const saveTextMutation = useMutation({
    mutationFn: async () => await api.adminPosterSetText({ passcode, text }),
    onSuccess: () => {
      setTextSaved(true);
      setError("");
      invalidate();
    },
    onError: (e) => setError(e instanceof Error ? e.message : t("failedShort")),
  });
  const addGroupMutation = useMutation({
    mutationFn: async () => await api.adminPosterAddGroup({ passcode, name: groupName, url: groupUrl }),
    onSuccess: () => {
      setGroupName("");
      setGroupUrl("");
      setError("");
      invalidate();
    },
    onError: (e) => setError(e instanceof Error ? e.message : t("failedShort")),
  });
  const deleteGroupMutation = useMutation({
    mutationFn: async (id: number) => await api.adminPosterDeleteGroup({ passcode, id }),
    onSuccess: () => {
      setConfirmDeleteGroupId(null);
      invalidate();
    },
    onError: (e) => setError(e instanceof Error ? e.message : t("failedShort")),
  });
  const resetMutation = useMutation({
    mutationFn: async () => await api.adminPosterReset({ passcode }),
    onSuccess: () => {
      setConfirmReset(false);
      invalidate();
    },
    onError: (e) => setError(e instanceof Error ? e.message : t("failedShort")),
  });
  const setStatusMutation = useMutation({
    mutationFn: async (args: { id: number; status: PosterProfile["status"] }) =>
      await api.adminPosterSetAccountStatus({ passcode, ...args }),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof Error ? e.message : t("failedShort")),
  });
  const deleteAccountMutation = useMutation({
    mutationFn: async (id: number) => await api.adminPosterDeleteAccount({ passcode, id }),
    onSuccess: () => {
      setConfirmDeleteAccountId(null);
      invalidate();
    },
    onError: (e) => setError(e instanceof Error ? e.message : t("failedShort")),
  });

  const groups = listQuery.data?.groups ?? [];
  const doneCount = groups.filter((g) => g.done).length;
  const posterUrl = `${window.location.origin}/poster`;

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="mb-1 text-base font-bold text-[var(--text)]">{t("posterLinkLabel")}</h3>
        <p className="mb-2 break-all text-sm font-semibold text-[var(--accent-strong)]">{posterUrl}</p>
        <p className="text-xs text-[var(--dim)]">{t("posterLinkHint")}</p>
      </div>

      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <label className="mb-1 block text-sm font-bold text-[var(--text)]" htmlFor="poster-post-text">
          {t("posterAdminTextLabel")}
        </label>
        <p className="mb-2 text-xs text-[var(--dim)]">{t("posterAdminTextHint")}</p>
        <textarea
          id="poster-post-text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setTextSaved(false);
          }}
          rows={5}
          placeholder={t("posterAdminTextPh")}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            disabled={saveTextMutation.isPending}
            onClick={() => saveTextMutation.mutate()}
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {t("posterSaveTextBtn")}
          </button>
          {textSaved ? <span className="text-sm font-semibold text-[var(--accent-strong)]">{t("posterSavedMsg")}</span> : null}
        </div>
      </div>

      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-[var(--text)]">
            {t("posterAdminGroupsTitle")} · {num(doneCount)} / {num(groups.length)}
          </h3>
          {groups.length > 0 ? (
            confirmReset ? (
              <button
                type="button"
                onClick={() => resetMutation.mutate()}
                className="rounded-full bg-[var(--danger)] px-3 py-1.5 text-xs font-bold text-white"
              >
                {t("posterResetConfirmBtn")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--dim)]"
              >
                {t("posterResetBtn")}
              </button>
            )
          ) : null}
        </div>
        <div className="space-y-2">
          {groups.map((g) => (
            <div
              key={g.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--text)]">{g.name}</p>
                <p className="truncate text-xs text-[var(--dim)]">{g.url}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    g.done ? "bg-[var(--surface-2)] text-[var(--accent-strong)]" : "bg-[var(--surface-2)] text-[var(--dim)]"
                  }`}
                >
                  {g.done ? t("posterGroupDoneChip") : t("posterGroupPendingChip")}
                </span>
                {confirmDeleteGroupId === g.id ? (
                  <button
                    type="button"
                    onClick={() => deleteGroupMutation.mutate(g.id)}
                    className="rounded-full bg-[var(--danger)] px-3 py-1 text-xs font-bold text-white"
                  >
                    {t("confirmDeleteBtn")}
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label={t("deleteBtn")}
                    onClick={() => setConfirmDeleteGroupId(g.id)}
                    className="rounded-full border border-[var(--border)] p-1.5 text-[var(--dim)]"
                  >
                    <IconTrash className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {groups.length === 0 ? (
            <p className="text-sm text-[var(--dim)]">{t("posterNoGroupsTitle")}</p>
          ) : null}
        </div>
        <div className="mt-4 border-t border-[var(--border)] pt-3">
          <h4 className="mb-2 text-sm font-bold text-[var(--text)]">{t("posterAddGroupTitle")}</h4>
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder={t("posterGroupNameLabel")}
            className="mb-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
          />
          <input
            value={groupUrl}
            onChange={(e) => setGroupUrl(e.target.value)}
            placeholder={t("posterGroupUrlLabel")}
            inputMode="url"
            className="mb-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
          />
          <button
            type="button"
            disabled={addGroupMutation.isPending || !groupName.trim() || !groupUrl.trim()}
            onClick={() => addGroupMutation.mutate()}
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {t("posterAddGroupBtn")}
          </button>
        </div>
      </div>

      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="mb-2 text-base font-bold text-[var(--text)]">{t("posterAccountsTitle")}</h3>
        {accountsQuery.data && accountsQuery.data.posters.length === 0 ? (
          <p className="text-sm text-[var(--dim)]">{t("posterAccountsEmpty")}</p>
        ) : null}
        <div className="space-y-2">
          {(accountsQuery.data?.posters ?? []).map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--text)]">{p.name}</p>
                <p className="text-xs text-[var(--dim)]">{p.phone}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    p.status === "approved"
                      ? "bg-[var(--surface-2)] text-[var(--accent-strong)]"
                      : p.status === "rejected"
                        ? "bg-[var(--surface-2)] text-[var(--danger)]"
                        : "bg-[var(--surface-2)] text-[var(--dim)]"
                  }`}
                >
                  {p.status === "approved"
                    ? t("posterStatusApproved")
                    : p.status === "rejected"
                      ? t("posterStatusRejected")
                      : t("posterStatusPending")}
                </span>
                {p.status !== "approved" ? (
                  <button
                    type="button"
                    onClick={() => setStatusMutation.mutate({ id: p.id, status: "approved" })}
                    className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-bold text-white"
                  >
                    {t("posterApproveBtn")}
                  </button>
                ) : null}
                {p.status !== "rejected" ? (
                  <button
                    type="button"
                    onClick={() => setStatusMutation.mutate({ id: p.id, status: "rejected" })}
                    className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold text-[var(--dim)]"
                  >
                    {t("posterRejectBtn")}
                  </button>
                ) : null}
                {confirmDeleteAccountId === p.id ? (
                  <button
                    type="button"
                    onClick={() => deleteAccountMutation.mutate(p.id)}
                    className="rounded-full bg-[var(--danger)] px-3 py-1 text-xs font-bold text-white"
                  >
                    {t("confirmDeleteBtn")}
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label={t("deleteBtn")}
                    onClick={() => setConfirmDeleteAccountId(p.id)}
                    className="rounded-full border border-[var(--border)] p-1.5 text-[var(--dim)]"
                  >
                    <IconTrash className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

/* ---------------- admin ---------------- */

function StatBox({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  const { lang } = useLang();
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-center">
      <p className={`text-2xl font-bold ${alert && value > 0 ? "text-[var(--danger)]" : "text-[var(--accent-strong)]"}`}>
        {fmtNum(value, lang)}
      </p>
      <p className="mt-0.5 text-xs text-[var(--dim)]">{label}</p>
    </div>
  );
}

/* ---------------- chatbot training (admin) ---------------- */
// Admin-taught question–answer pairs for the chatbot. The list loads
// from /api/admin (chatTrainingList); saving stores it as JSON in the
// settings table (chat_training_qa) and the AI reads it into its
// system prompt on every reply. Until the admin saves their own pairs,
// the defaults from lib/chatTraining.ts apply.
function AdminTraining({ passcode }: { passcode: string }) {
  const { t } = useLang();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<{ q: string; a: string }[]>([]);
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState("");
  const init = useRef(false);

  const listQuery = useQuery({
    queryKey: ["adminChatTraining", passcode],
    queryFn: async () => await api.adminChatTrainingList({ passcode }),
  });

  useEffect(() => {
    if (listQuery.data && !init.current) {
      setRows(listQuery.data.qa);
      init.current = true;
    }
  }, [listQuery.data]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["adminChatTraining"] });
  };

  const saveMutation = useMutation({
    mutationFn: async () =>
      await api.adminChatTrainingSave({
        passcode,
        qa: rows.filter((r) => r.q.trim() && r.a.trim()),
      }),
    onSuccess: () => {
      setSaved(true);
      setError("");
      invalidate();
    },
    onError: (e) => setError(e instanceof Error ? e.message : t("failedShort")),
  });

  const resetMutation = useMutation({
    mutationFn: async () => await api.adminChatTrainingReset({ passcode }),
    onSuccess: () => {
      setConfirmReset(false);
      setSaved(false);
      setError("");
      init.current = false;
      invalidate();
    },
    onError: (e) => setError(e instanceof Error ? e.message : t("failedShort")),
  });

  const setRow = (i: number, patch: Partial<{ q: string; a: string }>) => {
    setSaved(false);
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="mb-1 text-base font-bold text-[var(--text)]"><IconBot className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("trainingTitle")}</h3>
        <p className="text-sm text-[var(--dim)]">{t("trainingHint")}</p>
        {listQuery.data ? (
          <p className="mt-2 text-xs font-semibold text-[var(--accent-strong)]">
            {listQuery.data.isDefault ? t("trainingDefaultNote") : t("trainingCustomNote")}
          </p>
        ) : null}
      </div>

      {listQuery.isPending ? (
        <p className="py-8 text-center text-[var(--dim)]">{t("loadingShort")}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--dim)]">
          {t("trainingEmpty")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {rows.map((r, i) => (
            <div
              key={i}
              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-[var(--text)]">
                  {t("trainingQLabel")} {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSaved(false);
                    setRows((prev) => prev.filter((_, idx) => idx !== i));
                  }}
                  className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold text-[var(--danger)]"
                >
                  {t("trainingDeleteBtn")}
                </button>
              </div>
              <Field label={t("trainingQLabel")}>
                <input
                  aria-label={t("trainingQLabel")}
                  className={inputCls}
                  value={r.q}
                  onChange={(e) => setRow(i, { q: e.target.value })}
                  placeholder={t("trainingQPh")}
                />
              </Field>
              <div className="mt-2">
                <Field label={t("trainingALabel")}>
                  <textarea
                    aria-label={t("trainingALabel")}
                    className={inputCls}
                    rows={3}
                    value={r.a}
                    onChange={(e) => setRow(i, { a: e.target.value })}
                    placeholder={t("trainingAPh")}
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setSaved(false);
            setRows((prev) => [...prev, { q: "", a: "" }]);
          }}
          className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
        >
          {t("trainingAddBtn")}
        </button>
        <button
          type="button"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saveMutation.isPending ? t("saving") : t("trainingSaveBtn")}
        </button>
        {saved ? (
          <span className="text-sm font-semibold text-[var(--accent-strong)]"><IconCheckCircle className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("trainingSavedMsg")}</span>
        ) : null}
      </div>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
        {confirmReset ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={resetMutation.isPending}
              onClick={() => resetMutation.mutate()}
              className="rounded-full bg-[var(--danger)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {t("trainingResetConfirmBtn")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--dim)]"
            >
              {t("cancelBtn")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--dim)]"
          >
            {t("trainingResetBtn")}
          </button>
        )}
      </div>
    </div>
  );
}

function AdminPanel() {
  const { lang, t } = useLang();
  const num = (n: number | string) => fmtNum(n, lang);
  const queryClient = useQueryClient();
  const [passcode, setPasscode] = useState(() => sessionStorage.getItem("rt-admin") ?? "");
  const [entered, setEntered] = useState("");
  const [loginError, setLoginError] = useState("");
  const [section, setSection] = useState<"posts" | "applications" | "reports" | "chats" | "training" | "settings" | "poster">("posts");
  const [statusFilter, setStatusFilter] = useState<"" | Post["status"]>("pending");
  const [kindFilter, setKindFilter] = useState<"" | "guardian" | "tutor">("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Post | null>(null);
  const [actionError, setActionError] = useState("");

  const authed = passcode.length > 0;

  const verifyMutation = useMutation({
    mutationFn: async () => await api.adminVerify({ passcode: entered }),
    onSuccess: (res) => {
      if (res.ok) {
        sessionStorage.setItem("rt-admin", entered);
        setPasscode(entered);
        setLoginError("");
      } else {
        setLoginError(t("errPasscodeWrong"));
      }
    },
    onError: () => setLoginError(t("errVerifyFail")),
  });

  const statsQuery = useQuery({
    queryKey: ["adminStats", passcode],
    queryFn: () => api.adminStats({ passcode }),
    enabled: authed,
  });
  const postsQuery = useQuery({
    queryKey: ["adminPosts", passcode, statusFilter, kindFilter],
    queryFn: () =>
      api.adminListPosts({
        passcode,
        status: statusFilter || undefined,
        kind: kindFilter || undefined,
      }),
    enabled: authed && section === "posts",
  });
  const appsQuery = useQuery({
    queryKey: ["adminApplications", passcode],
    queryFn: () => api.adminListApplications({ passcode }),
    enabled: authed && section === "applications",
  });
  const reportsQuery = useQuery({
    queryKey: ["adminReports", passcode],
    queryFn: () => api.adminListReports({ passcode }),
    enabled: authed && section === "reports",
  });
  const configQuery = useQuery({ queryKey: ["config"], queryFn: () => api.getConfig({}) });
  const chatsBadgeQuery = useQuery({
    queryKey: ["adminChats", passcode],
    queryFn: () => api.adminChatList({ passcode }),
    enabled: authed,
  });
  const chatsNeedingAdmin = (chatsBadgeQuery.data?.conversations ?? []).filter(
    (c) => c.needsAdmin,
  ).length;

  const invalidateAdmin = () => {
    void queryClient.invalidateQueries({ queryKey: ["adminStats"] });
    void queryClient.invalidateQueries({ queryKey: ["adminChats"] });
    void queryClient.invalidateQueries({ queryKey: ["adminChat"] });
    void queryClient.invalidateQueries({ queryKey: ["adminPosts"] });
    void queryClient.invalidateQueries({ queryKey: ["adminApplications"] });
    void queryClient.invalidateQueries({ queryKey: ["adminReports"] });
    void queryClient.invalidateQueries({ queryKey: ["posts"] });
    void queryClient.invalidateQueries({ queryKey: ["stats"] });
    void queryClient.invalidateQueries({ queryKey: ["config"] });
  };

  const statusMutation = useMutation({
    mutationFn: async (v: { id: number; status: Post["status"] }) =>
      await api.adminSetPostStatus({ passcode, id: v.id, status: v.status }),
    onSuccess: invalidateAdmin,
    onError: () => setActionError(t("failedShort")),
  });
  const flagsMutation = useMutation({
    mutationFn: async (v: { id: number; featured?: boolean; verified?: boolean }) =>
      await api.adminSetPostFlags({ passcode, ...v }),
    onSuccess: invalidateAdmin,
    onError: () => setActionError(t("failedShort")),
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => await api.adminDeletePost({ passcode, id }),
    onSuccess: () => {
      setConfirmDeleteId(null);
      invalidateAdmin();
    },
    onError: () => setActionError(t("couldNotDelete")),
  });
  const appStatusMutation = useMutation({
    mutationFn: async (v: { id: number; status: AdminApplication["status"] }) =>
      await api.adminSetApplicationStatus({ passcode, ...v }),
    onSuccess: invalidateAdmin,
    onError: () => setActionError(t("failedShort")),
  });
  const appDeleteMutation = useMutation({
    mutationFn: async (id: number) => await api.adminDeleteApplication({ passcode, id }),
    onSuccess: invalidateAdmin,
  });
  const reportStatusMutation = useMutation({
    mutationFn: async (v: { id: number; status: AdminReport["status"] }) =>
      await api.adminSetReportStatus({ passcode, ...v }),
    onSuccess: invalidateAdmin,
    onError: () => setActionError(t("failedShort")),
  });

  if (!authed) {
    return (
      <div className="mx-auto max-w-md rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="text-xl font-bold text-[var(--text)]"><IconLock className="mr-2 inline h-5 w-5 align-[-3px]" /> {t("adminLoginTitle")}</h2>
        <p className="mt-2 text-sm text-[var(--dim)]">{t("adminLoginBody")}</p>
        <form
          className="mt-4 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!entered.trim()) return setLoginError(t("errPasscodeEmpty"));
            verifyMutation.mutate();
          }}
        >
          <Field label={t("passcodeLabel")}>
            <input
              {...FIELDS.adminVerify.passcode}
              type="password"
              aria-label={t("passcodeLabel")}
              className={inputCls}
              value={entered}
              onChange={(e) => setEntered(e.target.value)}
              placeholder={t("passcodePh")}
              autoComplete="current-password"
            />
          </Field>
          {loginError ? <p className="text-sm text-[var(--danger)]">{loginError}</p> : null}
          <button
            type="submit"
            disabled={verifyMutation.isPending}
            className="rounded-full bg-[var(--accent)] px-5 py-2.5 font-semibold text-white disabled:opacity-60"
          >
            {verifyMutation.isPending ? t("verifying") : t("loginBtn")}
          </button>
        </form>
      </div>
    );
  }

  const stats: AdminStats | undefined = statsQuery.data;
  const sectionTabs = [
    {
      v: "posts" as const,
      icon: <IconBoard className="mr-1 inline h-4 w-4 align-[-2px]" />,
      label: t("tabPosts") + (stats?.pending ? t("tabPostsPendingSuffix", { n: num(stats.pending) }) : ""),
    },
    {
      v: "applications" as const,
      icon: <IconMail className="mr-1 inline h-4 w-4 align-[-2px]" />,
      label: t("tabApplications") + (stats?.newApplications ? t("tabAppsNewSuffix", { n: num(stats.newApplications) }) : ""),
    },
    {
      v: "reports" as const,
      icon: <IconAlert className="mr-1 inline h-4 w-4 align-[-2px]" />,
      label: t("tabReports") + (stats?.openReports ? t("tabReportsSuffix", { n: num(stats.openReports) }) : ""),
    },
    {
      v: "chats" as const,
      icon: <IconChat className="mr-1 inline h-4 w-4 align-[-2px]" />,
      label: t("tabChats") + (chatsNeedingAdmin ? t("tabChatsSuffix", { n: num(chatsNeedingAdmin) }) : ""),
    },
    { v: "training" as const, icon: <IconBot className="mr-1 inline h-4 w-4 align-[-2px]" />, label: t("tabTraining") },
    { v: "settings" as const, icon: <IconSettings className="mr-1 inline h-4 w-4 align-[-2px]" />, label: t("tabSettings") },
    { v: "poster" as const, icon: <IconMegaphone className="mr-1 inline h-4 w-4 align-[-2px]" />, label: t("tabPoster") },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-[var(--text)]"><IconWrench className="mr-2 inline h-5 w-5 align-[-3px]" /> {t("adminPanelTitle")}</h2>
        <button
          type="button"
          onClick={() => {
            sessionStorage.removeItem("rt-admin");
            setPasscode("");
          }}
          className="rounded-full border border-[var(--border)] px-4 py-1.5 text-sm font-semibold text-[var(--dim)]"
        >
          {t("logoutBtn")}
        </button>
      </div>

      {stats ? (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatBox label={t("statPending")} value={stats.pending} alert />
          <StatBox label={t("statPublished")} value={stats.approved} />
          <StatBox label={t("statGuardian")} value={stats.guardianPosts} />
          <StatBox label={t("statTutor")} value={stats.tutorPosts} />
          <StatBox label={t("statTotalApps")} value={stats.applications} />
          <StatBox label={t("statNewApps")} value={stats.newApplications} alert />
          <StatBox label={t("statOpenReports")} value={stats.openReports} alert />
          <StatBox label={t("statRejectedClosed")} value={stats.rejected + stats.closed} />
        </div>
      ) : (
        <p className="mb-4 text-sm text-[var(--dim)]">{t("statsLoading")}</p>
      )}

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label={t("adminSectionsAria")}>
        {sectionTabs.map((t) => (
          <button
            key={t.v}
            type="button"
            role="tab"
            aria-selected={section === t.v}
            onClick={() => setSection(t.v)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              section === t.v ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-2)] text-[var(--dim)]"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {actionError ? <p className="mb-3 text-sm font-medium text-[var(--danger)]">{actionError}</p> : null}

      {section === "posts" ? (
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <select
              aria-label={t("filterStatusAria")}
              className={`${selectCls} w-auto`}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            >
              <option value="">{t("allStatuses")}</option>
              <option value="pending">{t("statusPending")}</option>
              <option value="approved">{t("statusApproved")}</option>
              <option value="rejected">{t("statusRejected")}</option>
              <option value="closed">{t("statusClosed")}</option>
            </select>
            <select
              aria-label={t("filterKindAria")}
              className={`${selectCls} w-auto`}
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}
            >
              <option value="">{t("allKinds")}</option>
              <option value="guardian">{t("guardianWord")}</option>
              <option value="tutor">{t("tutorWord")}</option>
            </select>
          </div>
          {postsQuery.isPending ? (
            <p className="py-8 text-center text-[var(--dim)]">{t("loadingShort")}</p>
          ) : (postsQuery.data?.posts ?? []).length === 0 ? (
            <EmptyState title={t("adminNoPostsTitle")} body={t("adminNoPostsBody")} />
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {(postsQuery.data?.posts ?? []).map((p) => (
                <article
                  key={p.id}
                  className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Chip tone={p.kind === "guardian" ? "blue" : "green"}>
                      {p.kind === "guardian" ? t("guardianWord") : t("tutorWord")}
                    </Chip>
                    <Chip
                      tone={p.status === "approved" ? "green" : p.status === "pending" ? "blue" : "soft"}
                    >
                      {p.status === "approved"
                        ? t("statusApproved")
                        : p.status === "pending"
                          ? t("statusPending")
                          : p.status === "rejected"
                            ? t("statusRejected")
                            : t("statusClosed")}
                    </Chip>
                    {p.featured ? <Chip tone="blue"><IconStar filled className="h-3.5 w-3.5" /> {t("chipFeatured")}</Chip> : null}
                    {p.verified ? <Chip tone="green"><IconShieldCheck className="h-3.5 w-3.5" /> {t("chipVerifiedShort")}</Chip> : null}
                    <span className="ml-auto text-xs text-[var(--dim)]">
                      {fullDate(p.createdAt, lang)} · {t("applicationsCount", { n: num(p.applicationCount) })}
                    </span>
                  </div>
                  <h3 className="mt-2 font-semibold text-[var(--text)]">{p.title}</h3>
                  <p className="mt-0.5 text-sm text-[var(--dim)]">
                    {p.authorName} · {p.phone} · <IconPin className="inline h-3.5 w-3.5 align-[-2px]" /> {areaLabel(p.area, lang)} · {salaryText(p, lang)}
                  </p>
                  <p className="mt-0.5 text-sm text-[var(--dim)]">
                    {p.subjects.map((s) => subjectLabel(s, lang)).join(", ")} —{" "}
                    {p.classes.map((c) => classLabel(c, lang)).join(", ")}
                  </p>
                  {p.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-[var(--dim)]">{p.description}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {p.status !== "approved" ? (
                      <button
                        type="button"
                        onClick={() => statusMutation.mutate({ id: p.id, status: "approved" })}
                        className="rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-sm font-semibold text-white"
                      >
                        <IconCheck className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("approveBtn")}
                      </button>
                    ) : null}
                    {p.status === "pending" ? (
                      <button
                        type="button"
                        onClick={() => statusMutation.mutate({ id: p.id, status: "rejected" })}
                        className="rounded-full bg-[var(--danger-soft)] px-3.5 py-1.5 text-sm font-semibold text-[var(--danger)]"
                      >
                        {t("rejectBtn")}
                      </button>
                    ) : null}
                    {p.status === "approved" ? (
                      <button
                        type="button"
                        onClick={() => statusMutation.mutate({ id: p.id, status: "closed" })}
                        className="rounded-full border border-[var(--border)] px-3.5 py-1.5 text-sm font-semibold text-[var(--dim)]"
                      >
                        {t("closeBtn")}
                      </button>
                    ) : null}
                    {(p.status === "rejected" || p.status === "closed") ? (
                      <button
                        type="button"
                        onClick={() => statusMutation.mutate({ id: p.id, status: "pending" })}
                        className="rounded-full border border-[var(--border)] px-3.5 py-1.5 text-sm font-semibold text-[var(--dim)]"
                      >
                        {t("rePendingBtn")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      aria-pressed={p.featured}
                      onClick={() => flagsMutation.mutate({ id: p.id, featured: !p.featured })}
                      className="rounded-full border border-[var(--border)] px-3.5 py-1.5 text-sm font-semibold text-[var(--text)]"
                    >
                      {p.featured ? (<><IconStar filled className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("featuredRemoveBtn")}</>) : (<><IconStar filled className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("featuredAddBtn")}</>)}
                    </button>
                    {p.kind === "tutor" ? (
                      <button
                        type="button"
                        aria-pressed={p.verified}
                        onClick={() => flagsMutation.mutate({ id: p.id, verified: !p.verified })}
                        className="rounded-full border border-[var(--border)] px-3.5 py-1.5 text-sm font-semibold text-[var(--text)]"
                      >
                        {p.verified ? (<><IconShieldCheck className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("verifyRemoveBtn")}</>) : (<><IconShieldCheck className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("verifyTutorBtn")}</>)}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setEditing(p)}
                      className="rounded-full border border-[var(--border)] px-3.5 py-1.5 text-sm font-semibold text-[var(--text)]"
                    >
                      <IconPen className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("editBtn")}
                    </button>
                    {confirmDeleteId === p.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => deleteMutation.mutate(p.id)}
                          className="rounded-full bg-[var(--danger)] px-3.5 py-1.5 text-sm font-semibold text-white"
                        >
                          {t("confirmDeleteBtn")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-full border border-[var(--border)] px-3.5 py-1.5 text-sm font-semibold text-[var(--dim)]"
                        >
                          {t("keepBtn")}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(p.id)}
                        className="rounded-full px-3.5 py-1.5 text-sm font-semibold text-[var(--danger)]"
                      >
                        <IconTrash className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("deleteBtn")}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
          {editing ? (
            <AdminEditPost
              post={editing}
              passcode={passcode}
              onClose={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                invalidateAdmin();
              }}
            />
          ) : null}
        </div>
      ) : null}

      {section === "applications" ? (
        <div className="grid grid-cols-1 gap-3">
          {appsQuery.isPending ? (
            <p className="py-8 text-center text-[var(--dim)]">{t("loadingShort")}</p>
          ) : (appsQuery.data?.applications ?? []).length === 0 ? (
            <EmptyState title={t("noAppsTitle")} body={t("noAppsBody")} />
          ) : (
            (appsQuery.data?.applications ?? []).map((a) => (
              <article
                key={a.id}
                className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip tone={a.status === "new" ? "blue" : a.status === "accepted" ? "green" : "soft"}>
                    {a.status === "new"
                      ? t("appStatusNew")
                      : a.status === "contacted"
                        ? t("appStatusContacted")
                        : a.status === "accepted"
                          ? t("appStatusAccepted")
                          : t("appStatusRejected")}
                  </Chip>
                  <Chip>{a.applicantRole === "tutor" ? t("tutorApplicationChip") : t("guardianContactChip")}</Chip>
                  <span className="ml-auto text-xs text-[var(--dim)]">{fullDate(a.createdAt, lang)}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--dim)]">
                  {t("postColon")} <span className="font-semibold text-[var(--text)]">{a.postTitle}</span>
                </p>
                <p className="mt-0.5 text-sm text-[var(--text)]">
                  {a.applicantName} ·{" "}
                  <a className="font-semibold text-[var(--accent-strong)]" href={`tel:${a.applicantPhone}`}>
                    {a.applicantPhone}
                  </a>
                </p>
                {a.message ? <p className="mt-1 text-sm text-[var(--dim)]">“{a.message}”</p> : null}
                {a.status === "accepted" ? (
                  <CommissionEditor application={a} passcode={passcode} onSaved={invalidateAdmin} />
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {(["contacted", "accepted", "rejected", "new"] as const).map((s) =>
                    a.status !== s ? (
                      <button
                        key={s}
                        type="button"
                        onClick={() => appStatusMutation.mutate({ id: a.id, status: s })}
                        className="rounded-full border border-[var(--border)] px-3 py-1.5 text-sm font-semibold text-[var(--text)]"
                      >
                        {s === "contacted"
                          ? t("markContactedBtn")
                          : s === "accepted"
                            ? t("markAcceptedBtn")
                            : s === "rejected"
                              ? t("markRejectedBtn")
                              : t("markNewBtn")}
                      </button>
                    ) : null,
                  )}
                  <button
                    type="button"
                    onClick={() => appDeleteMutation.mutate(a.id)}
                    className="rounded-full px-3 py-1.5 text-sm font-semibold text-[var(--danger)]"
                  >
                    {t("deleteWordBtn")}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      ) : null}

      {section === "reports" ? (
        <div className="grid grid-cols-1 gap-3">
          {reportsQuery.isPending ? (
            <p className="py-8 text-center text-[var(--dim)]">{t("loadingShort")}</p>
          ) : (reportsQuery.data?.reports ?? []).length === 0 ? (
            <EmptyState title={t("noReportsTitle")} body={t("noReportsBody")} />
          ) : (
            (reportsQuery.data?.reports ?? []).map((r) => (
              <article
                key={r.id}
                className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip tone={r.status === "open" ? "blue" : "soft"}>
                    {r.status === "open"
                      ? t("reportStatusOpen")
                      : r.status === "resolved"
                        ? t("reportStatusResolved")
                        : t("reportStatusDismissed")}
                  </Chip>
                  <Chip>{reportReasonLabel(r.reason, lang)}</Chip>
                  <span className="ml-auto text-xs text-[var(--dim)]">{fullDate(r.createdAt, lang)}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--dim)]">
                  {t("postColon")} <span className="font-semibold text-[var(--text)]">{r.postTitle}</span>
                  {r.reporterName ? ` · ${t("reporterColon")} ${r.reporterName}` : ""}
                </p>
                {r.details ? <p className="mt-1 text-sm text-[var(--dim)]">“{r.details}”</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.status !== "resolved" ? (
                    <button
                      type="button"
                      onClick={() => reportStatusMutation.mutate({ id: r.id, status: "resolved" })}
                      className="rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-sm font-semibold text-white"
                    >
                      {t("resolveBtn")}
                    </button>
                  ) : null}
                  {r.status !== "dismissed" ? (
                    <button
                      type="button"
                      onClick={() => reportStatusMutation.mutate({ id: r.id, status: "dismissed" })}
                      className="rounded-full border border-[var(--border)] px-3.5 py-1.5 text-sm font-semibold text-[var(--dim)]"
                    >
                      {t("dismissBtn")}
                    </button>
                  ) : null}
                  {r.status !== "open" ? (
                    <button
                      type="button"
                      onClick={() => reportStatusMutation.mutate({ id: r.id, status: "open" })}
                      className="rounded-full border border-[var(--border)] px-3.5 py-1.5 text-sm font-semibold text-[var(--dim)]"
                    >
                      {t("reopenBtn")}
                    </button>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      ) : null}

      {section === "chats" ? <AdminChats passcode={passcode} /> : null}
      {section === "training" ? <AdminTraining passcode={passcode} /> : null}
      {section === "poster" ? <AdminPoster passcode={passcode} /> : null}

      {section === "settings" ? (
        <AdminSettings
          passcode={passcode}
          notice={configQuery.data?.notice ?? ""}
          autoApprove={configQuery.data?.autoApprove ?? false}
          chatAiEnabled={configQuery.data?.chatAiEnabled ?? true}
          passcodeFromEnv={configQuery.data?.passcodeFromEnv ?? false}
          onSaved={invalidateAdmin}
          onPasscodeChanged={(np) => {
            sessionStorage.setItem("rt-admin", np);
            setPasscode(np);
          }}
        />
      ) : null}
    </div>
  );
}

function AdminEditPost({
  post,
  passcode,
  onClose,
  onSaved,
}: {
  post: Post;
  passcode: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { lang, t } = useLang();
  const num = (n: number | string) => fmtNum(n, lang);
  const [title, setTitle] = useState(post.title);
  const [authorName, setAuthorName] = useState(post.authorName);
  const [phone, setPhone] = useState(post.phone);
  const [subjects, setSubjects] = useState<string[]>(post.subjects);
  const [classes, setClasses] = useState<string[]>(post.classes);
  const [area, setArea] = useState(post.area);
  const [addressNote, setAddressNote] = useState(post.addressNote);
  const [salaryMin, setSalaryMin] = useState(post.salaryMin != null ? String(post.salaryMin) : "");
  const [salaryMax, setSalaryMax] = useState(post.salaryMax != null ? String(post.salaryMax) : "");
  const [negotiable, setNegotiable] = useState(post.salaryNegotiable);
  const [daysPerWeek, setDaysPerWeek] = useState(post.daysPerWeek != null ? String(post.daysPerWeek) : "");
  const [mode, setMode] = useState<Post["mode"]>(post.mode);
  const [medium, setMedium] = useState<Post["medium"]>(post.medium);
  const [genderPref, setGenderPref] = useState<Post["genderPref"]>(post.genderPref);
  const [studentGender, setStudentGender] = useState<Post["studentGender"]>(post.studentGender);
  const [description, setDescription] = useState(post.description);
  const [institution, setInstitution] = useState(post.institution);
  const [experience, setExperience] = useState(post.experience);
  const [availability, setAvailability] = useState(post.availability);
  const [error, setError] = useState("");

  const toggle = (list: string[], setList: (v: string[]) => void) => (value: string) =>
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const mutation = useMutation({
    mutationFn: async () =>
      await api.adminUpdatePost({
        passcode,
        id: post.id,
        title: title.trim(),
        authorName: authorName.trim(),
        phone: phone.trim(),
        subjects,
        classes,
        area,
        addressNote: addressNote.trim(),
        salaryMin: salaryMin ? Number(salaryMin) : null,
        salaryMax: salaryMax ? Number(salaryMax) : null,
        salaryNegotiable: negotiable,
        daysPerWeek: daysPerWeek ? Number(daysPerWeek) : null,
        mode,
        medium,
        genderPref,
        studentGender,
        description: description.trim(),
        institution: institution.trim(),
        experience: experience.trim(),
        availability: availability.trim(),
      }),
    onSuccess: onSaved,
    onError: () => setError(t("saveFail")),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={t("editPostAria")}
      onClick={onClose}
    >
      <form
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-[var(--bg)] p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim().length < 5) return setError(t("errTitleAdmin"));
          if (!authorName.trim()) return setError(t("errNameAdmin"));
          if (!phone.trim()) return setError(t("errPhoneAdmin"));
          setError("");
          mutation.mutate();
        }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-[var(--text)]"><IconPen className="mr-2 inline h-5 w-5 align-[-3px]" /> {t("editPostTitle")}</h3>
          <button type="button" aria-label={t("closeAria")} onClick={onClose} className="inline-flex items-center justify-center rounded-full bg-[var(--surface-2)] p-2">
            <IconX className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormSection title={t("secIdentity")}>
            <Field label={t("fName")}>
              <input {...FIELDS.adminUpdatePost.authorName} className={inputCls} value={authorName} onChange={(e) => setAuthorName(e.target.value)} />
            </Field>
            <Field label={t("fMobile")}>
              <input {...FIELDS.adminUpdatePost.phone} type="tel" className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
          </FormSection>
          <FormSection title={t("secSubjects")}>
            <div className="sm:col-span-2">
              <Field label={t("fTitle")}>
                <input {...FIELDS.adminUpdatePost.title} className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label={t("subjectsStar")}>
                <ToggleChips options={SUBJECTS} selected={subjects} onToggle={toggle(subjects, setSubjects)} ariaLabel={t("chooseSubjectsAria")} labelOf={(v) => subjectLabel(v, lang)} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label={t("classesStar")}>
                <ToggleChips options={CLASSES} selected={classes} onToggle={toggle(classes, setClasses)} ariaLabel={t("chooseClassesAria")} labelOf={(v) => classLabel(v, lang)} />
              </Field>
            </div>
          </FormSection>
          <FormSection title={t("secArea")}>
            <Field label={t("areaAria")}>
              <select aria-label={t("areaAria")} className={selectCls} value={area} onChange={(e) => setArea(e.target.value)}>
                {AREAS.map((a) => (
                  <option key={a} value={a}>
                    {areaLabel(a, lang)}
                  </option>
                ))}
                {!AREAS.includes(area) ? <option value={area}>{areaLabel(area, lang)}</option> : null}
              </select>
            </Field>
            <Field label={t("addressNoteLabel")}>
              <input {...FIELDS.adminUpdatePost.addressNote} className={inputCls} value={addressNote} onChange={(e) => setAddressNote(e.target.value)} placeholder={t("addressNotePh")} />
            </Field>
          </FormSection>
          <FormSection title={t("secTimeSalary")}>
            <Field label={t("fMinSalary")}>
              <input {...FIELDS.adminUpdatePost.salaryMin} type="number" inputMode="numeric" aria-label={t("fMinSalary")} className={inputCls} value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} />
            </Field>
            <Field label={t("fMaxSalary")}>
              <input {...FIELDS.adminUpdatePost.salaryMax} type="number" inputMode="numeric" aria-label={t("fMaxSalary")} className={inputCls} value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} />
            </Field>
            <label className="flex items-center gap-2 text-sm font-medium text-[var(--text)]">
              <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={negotiable} onChange={(e) => setNegotiable(e.target.checked)} />
              {t("salaryNegotiable")}
            </label>
            <Field label={t("daysPerWeekLabel")}>
              <select aria-label={t("daysPerWeekLabel")} className={selectCls} value={daysPerWeek} onChange={(e) => setDaysPerWeek(e.target.value)}>
                <option value="">{t("notSpecified")}</option>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={d}>
                    {t("dayOption", { n: num(d) })}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("fMode")}>
              <select aria-label={t("fMode")} className={selectCls} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                <option value="home">{t("modeHomeOpt")}</option>
                <option value="online">{t("modeOnlineOpt")}</option>
                <option value="both">{t("modeBothOpt")}</option>
              </select>
            </Field>
            <Field label={t("fMedium")}>
              <select aria-label={t("fMedium")} className={selectCls} value={medium} onChange={(e) => setMedium(e.target.value as typeof medium)}>
                <option value="bangla">{t("mediumBangla")}</option>
                <option value="english">{t("mediumEnglish")}</option>
                <option value="both">{t("mediumBoth")}</option>
              </select>
            </Field>
            {post.kind === "tutor" ? (
              <Field label={t("availabilityLabel")}>
                <input {...FIELDS.adminUpdatePost.availability} className={inputCls} value={availability} onChange={(e) => setAvailability(e.target.value)} placeholder={t("availabilityPh")} />
              </Field>
            ) : null}
          </FormSection>
          <FormSection title={t("secGenderPref")}>
            {post.kind === "guardian" ? (
              <>
                <Field label={t("studentGenderLabel")}>
                  <select aria-label={t("studentGenderLabel")} className={selectCls} value={studentGender} onChange={(e) => setStudentGender(e.target.value as typeof studentGender)}>
                    <option value="any">{t("notSpecified")}</option>
                    <option value="male">{t("maleOpt")}</option>
                    <option value="female">{t("femaleOpt")}</option>
                  </select>
                </Field>
                <Field label={t("prefTutorLabel")}>
                  <select aria-label={t("prefTutorLabel")} className={selectCls} value={genderPref} onChange={(e) => setGenderPref(e.target.value as typeof genderPref)}>
                    <option value="any">{t("anyOpt")}</option>
                    <option value="male">{t("maleTutorOpt")}</option>
                    <option value="female">{t("femaleTutorOpt")}</option>
                  </select>
                </Field>
              </>
            ) : (
              <Field label={t("yourGenderLabel")}>
                <select aria-label={t("yourGenderLabel")} className={selectCls} value={genderPref} onChange={(e) => setGenderPref(e.target.value as typeof genderPref)}>
                  <option value="any">{t("notSpecified")}</option>
                  <option value="male">{t("maleOpt")}</option>
                  <option value="female">{t("femaleOpt")}</option>
                </select>
              </Field>
            )}
          </FormSection>
          <FormSection title={t("secDetails")}>
            {post.kind === "tutor" ? (
              <>
                <Field label={t("institutionLabel")}>
                  <input {...FIELDS.adminUpdatePost.institution} className={inputCls} value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder={t("institutionPh")} />
                </Field>
                <Field label={t("experienceLabel")}>
                  <input {...FIELDS.adminUpdatePost.experience} className={inputCls} value={experience} onChange={(e) => setExperience(e.target.value)} placeholder={t("experiencePh")} />
                </Field>
              </>
            ) : null}
            <div className="sm:col-span-2">
              <Field label={t("fDescription")}>
                <textarea {...FIELDS.adminUpdatePost.description} className={inputCls} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
            </div>
          </FormSection>
          {error ? <p className="text-sm text-[var(--danger)] sm:col-span-2">{error}</p> : null}
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-full bg-[var(--accent)] px-5 py-2.5 font-semibold text-white disabled:opacity-60 sm:col-span-2"
          >
            {mutation.isPending ? t("saving") : t("saveBtn")}
          </button>
        </div>
      </form>
    </div>
  );
}

function AdminSettings({
  passcode,
  notice,
  autoApprove,
  chatAiEnabled,
  passcodeFromEnv,
  onSaved,
  onPasscodeChanged,
}: {
  passcode: string;
  notice: string;
  autoApprove: boolean;
  chatAiEnabled: boolean;
  passcodeFromEnv: boolean;
  onSaved: () => void;
  onPasscodeChanged: (np: string) => void;
}) {
  const { t } = useLang();
  const [noticeText, setNoticeText] = useState(notice);
  const [auto, setAuto] = useState(autoApprove);
  const [chatAi, setChatAi] = useState(chatAiEnabled);
  const [newPass, setNewPass] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: async () =>
      await api.adminUpdateSettings({
        passcode,
        notice: noticeText.trim(),
        autoApprove: auto,
        chatAiEnabled: chatAi,
        newPasscode: !passcodeFromEnv && newPass.trim() ? newPass.trim() : undefined,
      }),
    onSuccess: () => {
      setMsg(t("settingsSavedMsg"));
      if (newPass.trim()) {
        onPasscodeChanged(newPass.trim());
        setNewPass("");
      }
      onSaved();
    },
    onError: () => setError(t("saveFail")),
  });

  return (
    <form
      className="grid max-w-xl grid-cols-1 gap-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (newPass.trim() && newPass.trim().length < 4)
          return setError(t("errPasscodeShort"));
        setError("");
        setMsg("");
        mutation.mutate();
      }}
    >
      <Field label={t("noticeLabel")} hint={t("noticeHint")}>
        <textarea
          {...FIELDS.adminUpdateSettings.notice}
          className={inputCls}
          rows={2}
          value={noticeText}
          onChange={(e) => setNoticeText(e.target.value)}
          placeholder={t("noticePh")}
        />
      </Field>
      <label className="flex items-start gap-3 text-sm font-medium text-[var(--text)]">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 accent-[var(--accent)]"
          checked={auto}
          onChange={(e) => setAuto(e.target.checked)}
        />
        <span>
          {t("autoApproveLabel")}
          <span className="block text-xs font-normal text-[var(--dim)]">{t("autoApproveHint")}</span>
        </span>
      </label>
      <label className="flex items-start gap-3 text-sm font-medium text-[var(--text)]">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
          checked={chatAi}
          onChange={(e) => setChatAi(e.target.checked)}
        />
        <span>
          {t("chatAiLabel")}
          <span className="block text-xs font-normal text-[var(--dim)]">{t("chatAiHint")}</span>
        </span>
      </label>
      {passcodeFromEnv ? (
        <p className="rounded-[var(--radius)] bg-[var(--accent-soft)] px-3 py-2.5 text-sm text-[var(--accent-strong)]">
          <IconLock className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("passcodeEnvHint")}
        </p>
      ) : (
        <Field label={t("newPasscodeLabel")} hint={t("newPasscodeHint")}>
          <input
            {...FIELDS.adminUpdateSettings.newPasscode}
            type="password"
            aria-label={t("newPasscodeLabel")}
            className={inputCls}
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
      )}
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
        <p className="text-sm font-bold text-[var(--text)]"><IconRocket className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("deployTitle")}</p>
        <p className="mt-1 text-sm text-[var(--dim)]">{t("deployBody")}</p>
        <a
          href="https://barakatutors.vercel.app"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-sm font-semibold text-[var(--accent-strong)] underline"
        >
          <IconExternal className="mr-1 inline h-3.5 w-3.5 align-[-2px]" /> {t("liveSiteLink")}
        </a>
      </div>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {msg ? <p className="text-sm font-medium text-[var(--accent-strong)]"><IconCheckCircle className="mr-1 inline h-4 w-4 align-[-2px]" /> {msg}</p> : null}
      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded-full bg-[var(--accent)] px-5 py-2.5 font-semibold text-white disabled:opacity-60"
      >
        {mutation.isPending ? t("saving") : t("saveSettingsBtn")}
      </button>
    </form>
  );
}

/* ---------------- live chat ---------------- */

function ChatBubbles({
  messages,
  viewer,
}: {
  messages: ChatMessage[];
  viewer: "visitor" | "admin";
}) {
  const { t } = useLang();
  return (
    <div className="flex flex-col gap-2.5">
      {messages.map((m) => {
        const mine =
          viewer === "visitor" ? m.sender === "visitor" : m.sender === "admin";
        const isAi = m.sender === "ai";
        return (
          <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                mine
                  ? "rounded-br-md bg-[var(--accent)] text-white"
                  : isAi
                    ? "rounded-bl-md bg-[var(--accent-soft)] text-[var(--text)]"
                    : "rounded-bl-md bg-[var(--surface-2)] text-[var(--text)]"
              }`}
            >
              <p
                className={`mb-0.5 text-[11px] font-bold ${
                  mine ? "text-white/75" : "text-[var(--dim)]"
                }`}
              >
                {m.sender === "visitor"
                  ? viewer === "visitor"
                    ? t("chatSenderYou")
                    : t("chatSenderYou")
                  : isAi
                    ? (
                      <>
                        <IconBot className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
                        {t("chatSenderAi")}
                      </>
                    )
                    : (
                      <>
                        <IconUser className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
                        {t("chatSenderAdmin")}
                      </>
                    )}
              </p>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChatWidget() {
  const { lang, t } = useLang();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem("baraka-chat-id");
      return v ? Number(v) || null : null;
    } catch {
      return null;
    }
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  const pollQuery = useQuery({
    queryKey: ["chatPoll", conversationId],
    queryFn: () => api.chatPoll({ conversationId: conversationId ?? 0 }),
    enabled: open && conversationId != null,
    refetchInterval: 4000,
  });

  useEffect(() => {
    if (pollQuery.data) setLocalMessages(pollQuery.data.messages);
  }, [pollQuery.data]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [localMessages, open]);

  const startMutation = useMutation({
    mutationFn: async () =>
      await api.chatStart({ visitorName: name.trim(), visitorPhone: "", lang }),
    onSuccess: (res) => {
      setConversationId(res.conversationId);
      setLocalMessages(res.messages);
      try {
        localStorage.setItem("baraka-chat-id", String(res.conversationId));
      } catch {
        /* storage unavailable */
      }
    },
    onError: () => setError(t("chatStartFail")),
  });

  const sendMutation = useMutation({
    mutationFn: async () =>
      await api.chatSend({
        conversationId: conversationId ?? 0,
        body: draft.trim(),
        lang,
      }),
    onSuccess: (res) => {
      setDraft("");
      setLocalMessages(res.messages);
      void queryClient.invalidateQueries({ queryKey: ["adminChats"] });
    },
    onError: () => setError(t("chatSendFail")),
  });

  const mode = pollQuery.data?.mode ?? "ai";
  const aiEnabled = pollQuery.data?.aiEnabled ?? true;
  const needsAdmin = pollQuery.data?.needsAdmin ?? false;
  const lastMsg = localMessages[localMessages.length - 1];
  const waiting = lastMsg?.sender === "visitor" && (mode === "admin" || !aiEnabled);
  const subtitle = !aiEnabled
    ? t("chatSubtitleOff")
    : mode === "admin"
      ? t("chatSubtitleAdmin")
      : t("chatSubtitleAi");

  return (
    <>
      {/* TODO: replace with owner's real WhatsApp link (he will provide it later).
          Placeholder href="#" for now — do not invent a number or URL. */}
      {open ? null : (
        <a
          href="#"
          aria-label={t("whatsappAria")}
          className="fixed bottom-[172px] right-3 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--whatsapp)] text-white shadow-[0_8px_24px_rgba(37,211,102,0.45)] ring-2 ring-white sm:bottom-[104px] sm:right-6"
        >
          <IconWhatsApp className="h-7 w-7" />
        </a>
      )}
      <button
        type="button"
        aria-label={t("chatOpenAria")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-24 right-3 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--teal)] text-2xl shadow-[0_8px_24px_rgba(30,140,200,0.45)] ring-2 ring-white sm:bottom-6 sm:right-6"
      >
        {open ? <IconX className="h-6 w-6" /> : <IconChat className="h-6 w-6" />}
      </button>

      {open ? (
        <section
          aria-label={t("chatTitle")}
          className="fixed inset-x-3 bottom-40 z-50 flex h-[min(540px,62vh)] flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_50px_rgba(30,140,200,0.35)] sm:inset-x-auto sm:bottom-24 sm:right-6 sm:h-[540px] sm:w-[380px]"
        >
          <header className="shrink-0 bg-[var(--header-bg)] px-4 py-3">
            <p className="text-base font-bold text-white"><IconChat className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("chatTitle")}</p>
            <p className="text-xs text-white/75">{subtitle}</p>
          </header>

          {conversationId == null ? (
            <div className="flex flex-1 flex-col justify-center gap-3 p-5">
              <p className="flex justify-center"><IconChat className="h-10 w-10 text-[var(--dim)]" /></p>
              <p className="text-center text-sm text-[var(--dim)]">{t("chatSubtitleAi")}</p>
              <label className="sr-only" htmlFor="chat-name">
                {t("chatNamePh")}
              </label>
              <input
                id="chat-name"
                {...FIELDS.chatStart.visitorName}
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("chatNamePh")}
              />
              {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
              <button
                type="button"
                disabled={startMutation.isPending}
                onClick={() => {
                  setError("");
                  startMutation.mutate();
                }}
                className="rounded-full bg-[var(--accent)] px-5 py-2.5 font-semibold text-white disabled:opacity-60"
              >
                {t("chatStartBtn")}
              </button>
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg)] p-3">
                <ChatBubbles messages={localMessages} viewer="visitor" />
                {needsAdmin ? (
                  <p className="mt-3 text-center text-xs font-semibold text-[var(--sky)]">
                    <IconPin className="mr-1 inline h-3.5 w-3.5 align-[-2px]" /> {t("chatEscalated")}
                  </p>
                ) : null}
                {waiting ? (
                  <p className="mt-3 text-center text-xs font-medium text-[var(--dim)]">
                    <IconClock className="mr-1 inline h-3.5 w-3.5 align-[-2px]" /> {t("chatWaitingAdmin")}
                  </p>
                ) : null}
              </div>
              <form
                className="flex shrink-0 items-end gap-2 border-t border-[var(--border)] bg-[var(--surface)] p-3 pb-safe"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!draft.trim()) return;
                  setError("");
                  sendMutation.mutate();
                }}
              >
                <label className="sr-only" htmlFor="chat-input">
                  {t("chatInputPh")}
                </label>
                <textarea
                  id="chat-input"
                  {...FIELDS.chatSend.body}
                  className={`${inputCls} max-h-28 flex-1 resize-none`}
                  rows={1}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t("chatInputPh")}
                />
                <button
                  type="submit"
                  aria-label={t("chatSendAria")}
                  disabled={sendMutation.isPending || !draft.trim()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-lg text-white disabled:opacity-50"
                >
                  <IconSend className="h-5 w-5" />
                </button>
              </form>
              {error ? (
                <p className="shrink-0 bg-[var(--surface)] px-3 pb-2 text-xs text-[var(--danger)]">
                  {error}
                </p>
              ) : null}
            </>
          )}
        </section>
      ) : null}
    </>
  );
}

/* ---------------- admin chat inbox ---------------- */

function AdminChats({ passcode }: { passcode: string }) {
  const { lang, t } = useLang();
  const num = (n: number | string) => fmtNum(n, lang);
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const listQuery = useQuery({
    queryKey: ["adminChats", passcode],
    queryFn: () => api.adminChatList({ passcode }),
    refetchInterval: 8000,
  });
  const detailQuery = useQuery({
    queryKey: ["adminChat", passcode, selectedId],
    queryFn: () => api.adminChatGet({ passcode, conversationId: selectedId ?? 0 }),
    enabled: selectedId != null,
    refetchInterval: 5000,
  });
  const configQuery = useQuery({ queryKey: ["config"], queryFn: () => api.getConfig({}) });

  const detailMessages = detailQuery.data?.messages ?? [];
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [detailMessages.length, selectedId]);

  const invalidateChats = () => {
    void queryClient.invalidateQueries({ queryKey: ["adminChats"] });
    void queryClient.invalidateQueries({ queryKey: ["adminChat"] });
    void queryClient.invalidateQueries({ queryKey: ["config"] });
  };

  const replyMutation = useMutation({
    mutationFn: async () =>
      await api.adminChatReply({
        passcode,
        conversationId: selectedId ?? 0,
        body: reply.trim(),
      }),
    onSuccess: () => {
      setReply("");
      invalidateChats();
    },
    onError: () => setError(t("chatSendFail")),
  });
  const modeMutation = useMutation({
    mutationFn: async (mode: "ai" | "admin") =>
      await api.adminChatSetMode({ passcode, conversationId: selectedId ?? 0, mode }),
    onSuccess: invalidateChats,
    onError: () => setError(t("failedShort")),
  });
  const aiToggleMutation = useMutation({
    mutationFn: async (enabled: boolean) =>
      await api.adminUpdateSettings({ passcode, chatAiEnabled: enabled }),
    onSuccess: invalidateChats,
    onError: () => setError(t("failedShort")),
  });

  const conversations = listQuery.data?.conversations ?? [];
  const selected = detailQuery.data?.conversation ?? null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <span className="text-sm font-bold text-[var(--text)]">
          <IconBot className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("chatAiToggleLabel")}
        </span>
        <label className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
          <input
            type="checkbox"
            aria-label={t("chatAiToggleLabel")}
            className="h-5 w-5 accent-[var(--accent)]"
            checked={configQuery.data?.chatAiEnabled ?? true}
            disabled={aiToggleMutation.isPending}
            onChange={(e) => aiToggleMutation.mutate(e.target.checked)}
          />
          {(configQuery.data?.chatAiEnabled ?? true) ? (<><IconBot className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("chatModeAi")}</>) : t("chatSubtitleOff")}
        </label>
      </div>
      {error ? <p className="mb-3 text-sm font-medium text-[var(--danger)]">{error}</p> : null}

      {selectedId == null ? (
        listQuery.isPending ? (
          <p className="py-8 text-center text-[var(--dim)]">{t("loadingShort")}</p>
        ) : conversations.length === 0 ? (
          <EmptyState title={t("noChatsTitle")} body={t("noChatsBody")} />
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 text-left"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-bold text-[var(--text)]">
                    {c.visitorName || t("chatVisitorAnon")}
                  </span>
                  {c.visitorPhone ? (
                    <span className="text-sm text-[var(--dim)]">{c.visitorPhone}</span>
                  ) : null}
                  <span className="ml-auto text-xs text-[var(--dim)]">
                    {timeAgo(c.updatedAt, lang)} · {num(c.messageCount)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-[var(--dim)]">{c.lastMessage}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Chip tone={c.mode === "admin" ? "green" : "soft"}>
                    {c.mode === "admin" ? (<><IconUser className="mr-1 inline h-3.5 w-3.5 align-[-2px]" /> {t("chatModeAdmin")}</>) : (<><IconBot className="mr-1 inline h-3.5 w-3.5 align-[-2px]" /> {t("chatModeAi")}</>)}
                  </Chip>
                  {c.needsAdmin ? <Chip tone="blue"><IconPin className="h-3.5 w-3.5" /> {t("chatNeedsAdmin")}</Chip> : null}
                </div>
              </button>
            ))}
          </div>
        )
      ) : (
        <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-3">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="rounded-full border border-[var(--border)] px-3.5 py-1.5 text-sm font-semibold text-[var(--text)]"
            >
              <IconArrowLeft className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("chatBackBtn")}
            </button>
            <div className="min-w-0">
              <p className="truncate font-bold text-[var(--text)]">
                {selected?.visitorName || t("chatVisitorAnon")}
                {selected?.visitorPhone ? ` · ${selected.visitorPhone}` : ""}
              </p>
              <p className="text-xs text-[var(--dim)]">
                {selected?.mode === "admin" ? (<><IconUser className="mr-1 inline h-3.5 w-3.5 align-[-2px]" /> {t("chatModeAdmin")}</>) : (<><IconBot className="mr-1 inline h-3.5 w-3.5 align-[-2px]" /> {t("chatModeAi")}</>)}
                {selected?.needsAdmin ? (<> · <IconPin className="mr-0.5 inline h-3 w-3 align-[-1px]" /> {t("chatNeedsAdmin")}</>) : null}
              </p>
            </div>
            {selected ? (
              <button
                type="button"
                onClick={() =>
                  modeMutation.mutate(selected.mode === "admin" ? "ai" : "admin")
                }
                className="ml-auto rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-sm font-semibold text-white"
              >
                {selected.mode === "admin" ? t("handBackBtn") : t("takeoverBtn")}
              </button>
            ) : null}
          </div>

          <div ref={scrollRef} className="max-h-[50vh] overflow-y-auto bg-[var(--bg)] p-3">
            {detailQuery.isPending ? (
              <p className="py-6 text-center text-[var(--dim)]">{t("loadingShort")}</p>
            ) : (
              <ChatBubbles messages={detailMessages} viewer="admin" />
            )}
          </div>

          <form
            className="flex items-end gap-2 border-t border-[var(--border)] p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!reply.trim()) return;
              setError("");
              replyMutation.mutate();
            }}
          >
            <label className="sr-only" htmlFor="admin-chat-reply">
              {t("chatReplyPh")}
            </label>
            <textarea
              id="admin-chat-reply"
              {...FIELDS.adminChatReply.body}
              className={`${inputCls} max-h-28 flex-1 resize-none`}
              rows={1}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={t("chatReplyPh")}
            />
            <button
              type="submit"
              disabled={replyMutation.isPending || !reply.trim()}
              className="shrink-0 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {t("chatReplyBtn")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/* ---------------- landing (Tasnim-style home) ---------------- */

const UNIVERSITIES = [
  "বেগম রোকেয়া বিশ্ববিদ্যালয়",
  "রংপুর মেডিকেল কলেজ",
  "কারমাইকেল কলেজ",
  "রংপুর সরকারি কলেজ",
  "রংপুর পলিটেকনিক ইনস্টিটিউট",
  "সরকারি রোকেয়া মহিলা কলেজ",
];

function Home({
  onFindTutor,
  onBrowseJobs,
  onBecomeTutor,
  onSelectUni,
  onOpenArea,
  onOpenFees,
}: {
  onFindTutor: () => void;
  onBrowseJobs: () => void;
  onBecomeTutor: () => void;
  onSelectUni: (name: string) => void;
  onOpenArea: (slug: string) => void;
  onOpenFees: () => void;
}) {
  const { lang, t } = useLang();
  const num = (n: number | string) => fmtNum(n, lang);
  const statsQuery = useQuery({ queryKey: ["stats"], queryFn: () => api.getStats({}) });
  const stats = statsQuery.data;
  const totalPosts = stats?.totalPosts ?? (stats ? stats.guardianPosts + stats.tutorPosts : 0);

  const statCards = [
    { n: stats?.guardianPosts ?? 0, label: t("statGuardianPosts"), icon: <IconHome className="h-6 w-6" /> },
    { n: stats?.tutorPosts ?? 0, label: t("statTutorOffers"), icon: <IconGradCap className="h-6 w-6" /> },
    { n: totalPosts, label: t("statTotalPosts"), icon: <IconBoard className="h-6 w-6" /> },
    { n: stats?.applications ?? 0, label: t("statTotalApps"), icon: <IconMail className="h-6 w-6" /> },
  ];

  const steps = [
    { n: 1, icon: <IconPen className="h-8 w-8" />, title: t("step1Title"), desc: t("step1Desc") },
    { n: 2, icon: <IconGradCap className="h-8 w-8" />, title: t("step2Title"), desc: t("step2Desc") },
    { n: 3, icon: <IconCheckCircle className="h-8 w-8" />, title: t("step3Title"), desc: t("step3Desc") },
    { n: 4, icon: <IconRocket className="h-8 w-8" />, title: t("step4Title"), desc: t("step4Desc") },
  ];

  const whyItems = [t("why1"), t("why2"), t("why3"), t("why4"), t("why5"), t("why6")];

  return (
    <div>
      {/* Hero — blue gradient, no external photo dependency. */}
      <section className="rounded-3xl bg-gradient-to-br from-[#35a5dc] via-[var(--accent)] to-[#157aad] px-5 py-10 text-white sm:px-10 sm:py-14">
        <span className="inline-block rounded-full border border-white/40 bg-white/15 px-3.5 py-1.5 text-xs font-semibold sm:text-sm">
          {t("heroBadge")}
        </span>
        {/* The page's single H1 (SEO spec P0 #4) — big, bold, white,
            text unchanged in wording: "রংপুরে সঠিক হোম টিউটর খুঁজুন". */}
        <h1 className="mt-4 max-w-2xl text-3xl font-extrabold leading-tight sm:text-5xl">
          {t("heroTitleStart")}
          <span className="text-4xl font-black text-white sm:text-6xl">{"\u00A0"}{t("heroTitleAccent")}</span>{" "}
          {t("heroTitleEnd")}
        </h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-white/90 sm:text-lg">
          {t("heroSub")}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onFindTutor}
            className="rounded-full bg-white px-6 py-3 text-base font-bold text-[#157aad] shadow-lg"
          >
            {t("heroFindBtn")} →
          </button>
          <button
            type="button"
            onClick={onBrowseJobs}
            className="rounded-full border border-white/60 bg-white/15 px-6 py-3 text-base font-semibold text-white"
          >
            {t("heroJobsBtn")}
          </button>
        </div>
        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/25 pt-4 text-sm font-semibold">
          <span><IconBoard className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("trustStripPosts", { n: num(totalPosts) })}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[#157aad] shadow-md">
            <IconShieldCheck className="h-4 w-4" /> {t("trustStripVerified")}
          </span>
          <span><IconPin className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("trustStripArea")}</span>
        </div>
      </section>

      {/* Stats — 4 cards, numbers from live data only. */}
      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_1px_2px_rgba(30,140,200,0.06)]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-strong)]">
              {s.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-xl font-bold leading-tight text-[var(--text)] sm:text-2xl">{num(s.n)}</span>
              <span className="block text-xs leading-snug text-[var(--dim)] sm:text-sm">{s.label}</span>
            </span>
          </div>
        ))}
      </section>

      {/* Tutors from Rangpur's top institutions — 6 cards, tap to filter the board. */}
      <section id="home-tutors" className="mt-14 scroll-mt-28 text-center">
        <h2 className="text-2xl font-bold text-[var(--text)] sm:text-4xl">
          {t("uniTitleA")} <span className="text-[var(--accent-strong)]">{t("uniTitleB")}</span>
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-[var(--dim)] sm:text-base">{t("uniSub")}</p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {UNIVERSITIES.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => onSelectUni(u)}
              className="flex flex-col items-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-5 shadow-[0_1px_2px_rgba(30,140,200,0.06)] transition-colors hover:border-[var(--accent)]"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                <IconGradCap className="h-8 w-8" />
              </span>
              <span className="mt-3 text-sm font-bold leading-snug text-[var(--text)] sm:text-base">{u}</span>
            </button>
          ))}
        </div>
      </section>

      {/* How it works — 4 steps + centred CTA. */}
      <section className="mt-14 text-center">
        <h2 className="text-2xl font-bold text-[var(--text)] sm:text-4xl">{t("howTitle")}</h2>
        <p className="mt-2 text-sm text-[var(--dim)] sm:text-base">{t("howSub")}</p>
        <div className="mt-6 grid grid-cols-1 gap-3 text-left sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <div
              key={s.n}
              className="relative rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5 text-center shadow-[0_1px_2px_rgba(30,140,200,0.06)]"
            >
              <span className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-bold text-white">
                {num(s.n)}
              </span>
              <p className="flex justify-center text-[var(--accent-strong)]">{s.icon}</p>
              <h3 className="mt-3 text-base font-bold text-[var(--text)]">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-[var(--dim)]">{s.desc}</p>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onFindTutor}
          className="mt-6 rounded-full bg-[var(--accent)] px-6 py-3 text-base font-bold text-white shadow-lg"
        >
          {t("requestTutorBtn")} →
        </button>
      </section>

      {/* Why choose — blue banner (header blue), 2 columns. */}
      <section className="mt-14 grid grid-cols-1 gap-6 rounded-3xl bg-[var(--navy)] px-5 py-8 text-white sm:px-8 sm:py-10 lg:grid-cols-2 lg:items-center">
        <div>
          <h2 className="text-2xl font-bold leading-tight sm:text-4xl">
            {t("whyTitleA")} <span className="text-white">{t("whyTitleB")}</span>
          </h2>
          <p className="mt-3 max-w-md text-base leading-relaxed text-white/85">{t("whySub")}</p>
          <button
            type="button"
            onClick={onBecomeTutor}
            className="mt-5 rounded-full bg-white px-5 py-2.5 text-base font-bold text-[#157aad]"
          >
            {t("becomeTutorBtn")}
          </button>
        </div>
        <ul className="grid grid-cols-1 gap-2.5">
          {whyItems.map((w) => (
            <li
              key={w}
              className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3 text-sm font-medium sm:text-base"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#35a5dc] text-white">
                <IconCheck className="h-4 w-4" />
              </span>
              {w}
            </li>
          ))}
        </ul>
      </section>

      {/* Areas — one link per SEO area page (research §3). Real anchors
          (href=/area/<slug>) so crawlers can follow them; the click is
          handled in-app. */}
      <section className="mt-14 text-center">
        <h2 className="text-2xl font-bold text-[var(--text)] sm:text-4xl">{t("areasTitle")}</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-[var(--dim)] sm:text-base">{t("areasSub")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {SEO_AREAS.map((a) => (
            <a
              key={a.slug}
              href={`/area/${a.slug}`}
              onClick={(e) => {
                e.preventDefault();
                onOpenArea(a.slug);
              }}
              className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--accent-strong)] shadow-[0_1px_2px_rgba(30,140,200,0.06)]"
            >
              <IconPin className="mr-1 inline h-4 w-4 align-[-2px]" />
              {lang === "en" ? `${a.en}, Rangpur` : `${a.bn}, রংপুর`}
            </a>
          ))}
          <a
            href="/fees"
            onClick={(e) => {
              e.preventDefault();
              onOpenFees();
            }}
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--accent-strong)] shadow-[0_1px_2px_rgba(30,140,200,0.06)]"
          >
            {t("feesLinkLabel")}
          </a>
        </div>
      </section>

      {/* FAQ — the 7 researched GEO questions, verbatim (research §6);
          FAQPage JSON-LD is injected by the app's SEO manager. */}
      <FaqSection faq={HOME_FAQ} />

      {/* Final CTA banner — blue (accent-strong), centred. */}
      <section className="mt-6 rounded-3xl bg-[var(--navy-2)] px-5 py-10 text-center text-white sm:py-12">
        <span className="inline-block rounded-full border border-white/40 bg-white/15 px-3.5 py-1.5 text-xs font-semibold sm:text-sm">
          {t("ctaBadge")}
        </span>
        <h2 className="mt-4 text-2xl font-bold sm:text-4xl">{t("ctaTitle")}</h2>
        <p className="mt-2 text-base text-white/85">{t("ctaSub")}</p>
        <button
          type="button"
          onClick={onFindTutor}
          className="mt-6 rounded-full bg-[var(--accent)] px-6 py-3 text-base font-bold text-white shadow-lg"
        >
          {t("ctaBtn")} →
        </button>
      </section>
    </div>
  );
}

/* ---------------- SEO: FAQ / fee table / area & fee pages ---------------- */

/** Visible FAQ block: question verbatim in an <h3> inside <summary>
    (native <details>, content stays in the DOM for crawlers/AI search),
    direct answer first. The matching FAQPage JSON-LD is injected by the
    app's SEO manager. */
function FaqSection({ faq, heading }: { faq: FaqEntry[]; heading?: boolean }) {
  const { lang, t } = useLang();
  return (
    <section className="mt-14">
      {heading === false ? null : (
        <>
          <h2 className="text-center text-2xl font-bold text-[var(--text)] sm:text-4xl">{t("faqTitle")}</h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-[var(--dim)] sm:text-base">{t("faqSub")}</p>
        </>
      )}
      <div className="mx-auto mt-6 grid max-w-4xl grid-cols-1 gap-3">
        {faq.map((f) => (
          <details
            key={f.q.bn}
            className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 py-4 shadow-[0_1px_2px_rgba(30,140,200,0.06)]"
          >
            <summary className="cursor-pointer list-none">
              <h3 className="inline text-base font-bold text-[var(--text)] sm:text-lg">{f.q[lang]}</h3>
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-[var(--dim)] sm:text-base">{f.a[lang]}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/* Class groups for the fee table — matched against a post's class list. */
const FEE_GROUPS: { key: StringKey; classes: string[] }[] = [
  { key: "feeGroupPrimary", classes: ["১ম শ্রেণি", "২য় শ্রেণি", "৩য় শ্রেণি", "৪র্থ শ্রেণি", "৫ম শ্রেণি", "প্লে–নার্সারি"] },
  { key: "feeGroupJunior", classes: ["৬ষ্ঠ শ্রেণি", "৭ম শ্রেণি", "৮ম শ্রেণি"] },
  { key: "feeGroupSsc", classes: ["৯ম শ্রেণি", "১০ম শ্রেণি"] },
  { key: "feeGroupHsc", classes: ["একাদশ (HSC)", "দ্বাদশ (HSC)"] },
  { key: "feeGroupAdmission", classes: ["ভর্তি প্রস্তুতি"] },
];

function feeRangeOf(posts: Post[]): { min: number; max: number; count: number } | null {
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  let count = 0;
  for (const p of posts) {
    const lo = p.salaryMin ?? p.salaryMax;
    const hi = p.salaryMax ?? p.salaryMin;
    if (lo == null && hi == null) continue;
    if (lo != null) min = Math.min(min, lo);
    if (hi != null) max = Math.max(max, hi);
    count += 1;
  }
  return count > 0 ? { min, max, count } : null;
}

/** Approximate fee table computed from LIVE approved posts (never a
    competitor's numbers). A group with no salaried posts shows "no posts
    yet" instead of an invented figure. */
function FeeTable({ posts }: { posts: Post[] }) {
  const { lang, t } = useLang();
  const num = (n: number | string) => fmtNum(n, lang);
  const money = (n: number) => `৳${num(n.toLocaleString("en-IN"))}`;
  const rows = FEE_GROUPS.map((g) => ({
    label: t(g.key),
    range: feeRangeOf(posts.filter((p) => p.classes.some((c) => g.classes.includes(c)))),
  }));
  const overall = feeRangeOf(posts);
  const feeCell = (r: { min: number; max: number } | null) =>
    r == null ? t("feesNoData") : r.min === r.max ? money(r.min) : `${money(r.min)} – ${money(r.max)}`;
  return (
    <div>
      <h2 className="text-xl font-bold text-[var(--text)] sm:text-2xl">{t("feesTableTitle")}</h2>
      <div className="mt-3 overflow-x-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full min-w-[420px] text-left text-sm sm:text-base">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
              <th scope="col" className="px-4 py-3 font-bold text-[var(--text)]">{t("feesColClass")}</th>
              <th scope="col" className="px-4 py-3 font-bold text-[var(--text)]">{t("feesColFee")}</th>
              <th scope="col" className="px-4 py-3 font-bold text-[var(--text)]">{t("feesColPosts")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-3 font-medium text-[var(--text)]">{r.label}</td>
                <td className="px-4 py-3 text-[var(--dim)]">{feeCell(r.range)}</td>
                <td className="px-4 py-3 text-[var(--dim)]">{r.range ? num(r.range.count) : num(0)}</td>
              </tr>
            ))}
            <tr className="bg-[var(--accent-soft)]">
              <td className="px-4 py-3 font-bold text-[var(--text)]">{t("feeGroupAll")}</td>
              <td className="px-4 py-3 font-bold text-[var(--accent-strong)]">{feeCell(overall)}</td>
              <td className="px-4 py-3 font-bold text-[var(--accent-strong)]">{overall ? num(overall.count) : num(0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[var(--dim)] sm:text-sm">{t("feesNote")}</p>
    </div>
  );
}

/** Subject quick-links: jump to the board filtered by that subject. */
function SubjectLinks({ onPick }: { onPick: (subject: string) => void }) {
  const { lang, t } = useLang();
  return (
    <div>
      <h2 className="text-xl font-bold text-[var(--text)] sm:text-2xl">{t("subjectLinksTitle")}</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUBJECTS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-full bg-[var(--surface-2)] px-4 py-2 text-sm font-semibold text-[var(--accent-strong)]"
          >
            {subjectLabel(s, lang)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Area page (research §3 template): H1 + live posts for the area +
    approximate fee table + subject links + FAQ. The "N tutors" count is
    only ever the real count of matching live posts — never invented. */
function AreaView({
  area,
  onOpen,
  onFindTutor,
  onPickSubject,
}: {
  area: SeoArea;
  onOpen: (post: Post) => void;
  onFindTutor: () => void;
  onPickSubject: (subject: string) => void;
}) {
  const { lang, t } = useLang();
  const postsQuery = useQuery({
    queryKey: ["posts", { limit: 200 }],
    queryFn: () => api.listPosts({ limit: 200 }),
  });
  const favIdsQuery = useQuery({
    queryKey: ["favoriteIds"],
    queryFn: () => api.listFavoriteIds({}),
  });
  const favIds = new Set(favIdsQuery.data?.favoriteIds ?? []);
  const queryClient = useQueryClient();
  const favMutation = useMutation({
    mutationFn: async (post: Post) => await api.toggleFavorite({ postId: post.id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["favoriteIds"] });
      void queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });
  const all = postsQuery.data?.posts ?? [];
  const posts = all.filter((p) => postInArea(p, area));
  const areaName = lang === "en" ? area.en : area.bn;
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-extrabold leading-tight text-[var(--text)] sm:text-4xl">
        {lang === "en" ? `Home Tutors in ${area.en}, Rangpur` : `${area.bn} এলাকায় হোম টিউটর`}
      </h1>
      <p className="mt-3 text-base leading-relaxed text-[var(--dim)]">{t("areaIntro", { area: areaName })}</p>

      <section className="mt-8">
        <h2 className="text-xl font-bold text-[var(--text)] sm:text-2xl">{t("areaPostsTitle", { area: areaName })}</h2>
        {postsQuery.isLoading ? (
          <p className="py-8 text-center text-[var(--dim)]">{t("loadingShort")}</p>
        ) : posts.length === 0 ? (
          <div className="mt-3">
            <EmptyState title={t("areaPostsTitle", { area: areaName })} body={t("areaNoPosts")} />
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3">
            {posts.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                isFavorite={favIds.has(p.id)}
                onOpen={onOpen}
                onToggleFavorite={(post) => favMutation.mutate(post)}
              />
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={onFindTutor}
          className="mt-5 rounded-full bg-[var(--accent)] px-6 py-3 text-base font-bold text-white shadow-lg"
        >
          {t("heroFindBtn")} →
        </button>
      </section>

      <section className="mt-10">
        <FeeTable posts={posts.length > 0 ? posts : all} />
      </section>

      <section className="mt-10">
        <SubjectLinks onPick={onPickSubject} />
      </section>

      <FaqSection faq={areaFaq(area)} heading={false} />
    </div>
  );
}

/** Fee-guide page: "রংপুরে হোম টিউটরের বেতন কত?" — direct answer first,
    live-data fee table, factors, fee FAQ + FAQPage schema (SEO manager). */
function FeesView({
  onFindTutor,
  onPickSubject,
}: {
  onFindTutor: () => void;
  onPickSubject: (subject: string) => void;
}) {
  const { t } = useLang();
  const postsQuery = useQuery({
    queryKey: ["posts", { limit: 200 }],
    queryFn: () => api.listPosts({ limit: 200 }),
  });
  const all = postsQuery.data?.posts ?? [];
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-extrabold leading-tight text-[var(--text)] sm:text-4xl">{t("feesH1")}</h1>
      <p className="mt-3 text-base leading-relaxed text-[var(--dim)]">{t("feesIntro")}</p>

      <section className="mt-8">
        {postsQuery.isLoading ? (
          <p className="py-8 text-center text-[var(--dim)]">{t("loadingShort")}</p>
        ) : (
          <FeeTable posts={all} />
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-bold text-[var(--text)] sm:text-2xl">{t("feesFactorsTitle")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--dim)] sm:text-base">{t("feesFactors")}</p>
        <button
          type="button"
          onClick={onFindTutor}
          className="mt-5 rounded-full bg-[var(--accent)] px-6 py-3 text-base font-bold text-white shadow-lg"
        >
          {t("heroFindBtn")} →
        </button>
      </section>

      <section className="mt-10">
        <SubjectLinks onPick={onPickSubject} />
      </section>

      <FaqSection faq={FEES_FAQ} heading={false} />
    </div>
  );
}

/* ---------------- about ---------------- */

function AboutView() {
  const { t } = useLang();
  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-8">
        <h2 className="text-2xl font-bold text-[var(--text)] sm:text-3xl">{t("aboutTitle")}</h2>
        <p className="mt-4 text-base leading-relaxed text-[var(--text)]">{t("aboutBody1")}</p>
        <p className="mt-3 text-base leading-relaxed text-[var(--text)]">{t("aboutBody2")}</p>
        <div className="mt-6 rounded-[var(--radius)] bg-[var(--accent-soft)] px-4 py-4">
          <p className="text-sm font-bold text-[var(--accent-strong)]">{t("aboutMissionLabel")}</p>
          <p className="mt-1 text-base font-medium leading-relaxed text-[var(--text)]">
            “{t("aboutMission")}”
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------------- trust check ---------------- */

function TrustCheckView({ onOpen }: { onOpen: (post: Post) => void }) {
  const { lang, t } = useLang();
  const num = (n: number | string) => fmtNum(n, lang);
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const postsQuery = useQuery({
    queryKey: ["posts", "trust-check"],
    queryFn: () => api.listPosts({ kind: "tutor", limit: 100 }),
  });
  const verified = (postsQuery.data?.posts ?? []).filter((p) => p.verified);
  const q = query.trim().toLowerCase();
  const qDigits = query.replace(/\D/g, "");
  const results = !searched
    ? verified
    : verified.filter((p) => {
        if (!q) return true;
        const nameHit = p.authorName.toLowerCase().includes(q);
        const phoneHit = qDigits.length >= 3 && p.phone.replace(/\D/g, "").includes(qDigits);
        return nameHit || phoneHit;
      });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
        <p className="flex items-center gap-2 text-base font-bold text-[var(--text)]">
          <IconShieldCheck className="h-6 w-6 text-[var(--accent-strong)]" /> {t("trustTitle")}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--dim)] sm:text-base">{t("trustSub")}</p>

        <h3 className="mt-5 text-base font-bold text-[var(--text)]">{t("trustHowTitle")}</h3>
        <ol className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[t("trustHow1"), t("trustHow2"), t("trustHow3")].map((step, i) => (
            <li key={step} className="rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-3 text-sm leading-relaxed text-[var(--text)]">
              <span className="mb-1 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">
                {num(i + 1)}
              </span>
              {step}
            </li>
          ))}
        </ol>

        <form
          className="mt-5 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            setSearched(true);
          }}
        >
          <label className="sr-only" htmlFor="trust-search">
            {t("trustSearchPh")}
          </label>
          <input
            id="trust-search"
            type="search"
            className={`${inputCls} flex-1`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("trustSearchPh")}
          />
          <button
            type="submit"
            className="shrink-0 rounded-full bg-[var(--accent)] px-5 py-2.5 font-semibold text-white"
          >
            {t("trustSearchBtn")}
          </button>
        </form>

        <div className="mt-5">
          {postsQuery.isPending ? (
            <p className="py-6 text-center text-sm text-[var(--dim)]">{t("loadingShort")}</p>
          ) : verified.length === 0 ? (
            <EmptyState title={t("trustNoneYet")} body={t("trustDisclaimer")} />
          ) : (
            <>
              <p className="mb-3 text-sm font-semibold text-[var(--dim)]">
                {searched
                  ? t("trustResults", { n: num(results.length) })
                  : `${t("trustAllVerified")} (${num(verified.length)})`}
              </p>
              {results.length === 0 ? (
                <EmptyState title={t("trustNoResult")} body={t("trustDisclaimer")} />
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {results.map((p) => (
                    <article
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] p-4"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-[var(--text)]">{p.authorName}</p>
                        <p className="mt-0.5 text-sm text-[var(--dim)]">
                          {p.institution ? `${p.institution} · ` : ""}
                          <IconPin className="inline h-3.5 w-3.5 align-[-2px]" /> {areaLabel(p.area, lang)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Chip tone="green">
                          <IconShieldCheck className="h-3.5 w-3.5" /> {t("chipVerifiedTutor")}
                        </Chip>
                        <button
                          type="button"
                          onClick={() => onOpen(p)}
                          className="rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-sm font-semibold text-white"
                        >
                          {t("detailsBtn")}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <p className="mt-5 text-xs leading-relaxed text-[var(--dim)]">{t("trustDisclaimer")}</p>
      </div>
    </div>
  );
}

/* ---------------- legal ---------------- */

function LegalView({
  doc,
  onChange,
}: {
  doc: "privacy" | "terms";
  onChange: (d: "privacy" | "terms") => void;
}) {
  const { t } = useLang();
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex gap-2" role="tablist" aria-label={t("footerLegal")}>
        {(
          [
            { v: "privacy" as const, label: t("legalPrivacy") },
            { v: "terms" as const, label: t("legalTerms") },
          ]
        ).map((o) => (
          <button
            key={o.v}
            type="button"
            role="tab"
            aria-selected={doc === o.v}
            onClick={() => onChange(o.v)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              doc === o.v ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-2)] text-[var(--dim)]"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
        <h2 className="text-xl font-bold text-[var(--text)]">
          {doc === "privacy" ? t("legalPrivacy") : t("legalTerms")}
        </h2>
        <p className="mt-3 text-base leading-relaxed text-[var(--text)]">
          {doc === "privacy" ? t("privacyP1") : t("termsP1")}
        </p>
        <p className="mt-3 text-base leading-relaxed text-[var(--text)]">
          {doc === "privacy" ? t("privacyP2") : t("termsP2")}
        </p>
      </div>
    </div>
  );
}

/* ---------------- dark footer ---------------- */

function SiteFooter({
  onNavigate,
  onLegal,
  onOpenArea,
  onOpenFees,
}: {
  onNavigate: (v: View) => void;
  onLegal: (d: "privacy" | "terms") => void;
  onOpenArea: (slug: string) => void;
  onOpenFees: () => void;
}) {
  const { lang, t } = useLang();
  const quickLinks: { label: string; onClick: () => void }[] = [
    { label: t("navHome"), onClick: () => onNavigate("home") },
    { label: t("navBoard"), onClick: () => onNavigate("board") },
    { label: t("navFindTutor"), onClick: () => onNavigate("post") },
    { label: t("navJobs"), onClick: () => onNavigate("board") },
    { label: t("navTrust"), onClick: () => onNavigate("trust") },
    { label: t("navAbout"), onClick: () => onNavigate("about") },
  ];
  return (
    <footer className="mt-14 bg-[var(--navy)] text-white">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <div className="flex items-center gap-3">
            <img
              src={barakaLogo}
              alt=""
              className="h-12 w-12 rounded-xl bg-white object-contain p-1"
            />
            <p className="text-lg font-bold">{t("appName")}</p>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-white/80">{t("footerLine1")}</p>
          {/* TODO: replace with owner's real Facebook/Instagram/WhatsApp links
              (he will provide them later). Placeholder href="#" for now —
              do not invent URLs or a phone number. */}
          <div className="mt-4 flex gap-2">
            <a
              href="#"
              aria-label={t("socialFacebookAria")}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
            >
              <IconFacebook className="h-5 w-5" />
            </a>
            <a
              href="#"
              aria-label={t("socialInstagramAria")}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
            >
              <IconInstagram className="h-5 w-5" />
            </a>
            <a
              href="#"
              aria-label={t("socialWhatsAppAria")}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
            >
              <IconWhatsApp className="h-5 w-5" />
            </a>
          </div>
        </div>
        <div className="lg:col-span-2">
          <h3 className="text-base font-bold">{t("footerQuick")}</h3>
          <ul className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-sm text-white/80">
            {quickLinks.map((l) => (
              <li key={l.label}>
                <button type="button" onClick={l.onClick} className="hover:text-white hover:underline">
                  {l.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-base font-bold">{t("footerContact")}</h3>
          <p className="mt-3 text-sm leading-relaxed text-white/80">
            <IconPin className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("footerContactLine1")}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-white/80">
            <IconChat className="mr-1 inline h-4 w-4 align-[-2px]" /> {t("footerChatLine")}
          </p>
        </div>
        <div>
          <h3 className="text-base font-bold">{t("footerLegal")}</h3>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/80">
            <li>
              <button type="button" onClick={() => onLegal("privacy")} className="hover:text-white hover:underline">
                {t("legalPrivacy")}
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onLegal("terms")} className="hover:text-white hover:underline">
                {t("legalTerms")}
              </button>
            </li>
          </ul>
        </div>
      </div>
      {/* Area pages + fee guide — real crawlable anchors (research §8:
          footer carries the area list as natural links). */}
      <div className="border-t border-white/15">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <h3 className="text-sm font-bold">{t("footerAreas")}</h3>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-white/80">
            {SEO_AREAS.map((a) => (
              <li key={a.slug}>
                <a
                  href={`/area/${a.slug}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onOpenArea(a.slug);
                  }}
                  className="hover:text-white hover:underline"
                >
                  {lang === "en" ? `Tutors in ${a.en}` : `${a.bn} এলাকায় টিউটর`}
                </a>
              </li>
            ))}
            <li>
              <a
                href="/fees"
                onClick={(e) => {
                  e.preventDefault();
                  onOpenFees();
                }}
                className="hover:text-white hover:underline"
              >
                {t("feesLinkLabel")}
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/15 py-4 text-center text-xs text-white/70">
        © 2026 Baraka Tutors
      </div>
    </footer>
  );
}

/* ---------------- app shell ---------------- */

export function App() {
  const { lang, setLang, t } = useLang();
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("home");
  const [postKind, setPostKind] = useState<"guardian" | "tutor">("guardian");
  const [uniFilter, setUniFilter] = useState<string | null>(null);
  const [legalDoc, setLegalDoc] = useState<"privacy" | "terms">("privacy");
  const [menuOpen, setMenuOpen] = useState(false);
  const [filters, setFilters] = useState<BoardFilters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<Post | null>(null);
  /* SEO routes (spec P1 #8/#10): /area/<slug> and /fees are real views;
     /post/<id> deep-links open that post's detail. */
  const [areaSlug, setAreaSlug] = useState<string | null>(null);
  const [deepPostId, setDeepPostId] = useState<number | null>(null);

  /* Tutor session: token in localStorage, restored on load via tutorMe. */
  const [tutorToken, setTutorToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(TUTOR_TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const tutorQuery = useQuery({
    queryKey: ["tutorMe", tutorToken],
    queryFn: () => api.tutorMe({ token: tutorToken ?? "" }),
    enabled: tutorToken != null,
    retry: false,
  });
  const tutor: TutorProfile | null = tutorQuery.data?.tutor ?? null;
  /* Expired / invalid token: drop the session so the login view shows. */
  useEffect(() => {
    if (tutorQuery.isError && tutorToken) {
      try {
        localStorage.removeItem(TUTOR_TOKEN_KEY);
      } catch {
        /* storage unavailable */
      }
      setTutorToken(null);
    }
  }, [tutorQuery.isError, tutorToken]);

  const handleTutorAuthed = (profile: TutorProfile, token: string) => {
    try {
      localStorage.setItem(TUTOR_TOKEN_KEY, token);
    } catch {
      /* storage unavailable */
    }
    setTutorToken(token);
    // Seed the session query so the dashboard renders at once; the
    // tutorMe refetch below confirms it against the server.
    queryClient.setQueryData(["tutorMe", token], { tutor: profile });
    void queryClient.invalidateQueries({ queryKey: ["tutorMe"] });
    setView("dashboard");
  };
  const handleTutorLogout = () => {
    try {
      localStorage.removeItem(TUTOR_TOKEN_KEY);
    } catch {
      /* storage unavailable */
    }
    setTutorToken(null);
    void queryClient.invalidateQueries({ queryKey: ["tutorMe"] });
    setView("home");
  };

  /* Landing is the default view; every view change starts at the top. */
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  /* URL sync for the shareable SEO routes. pushState is best-effort: a
     sandboxed iframe may refuse it, and the app must work regardless. */
  const pushPath = (path: string) => {
    try {
      window.history.pushState(null, "", path);
    } catch {
      /* history unavailable — in-app navigation still works */
    }
  };

  const pathForView = (v: View, kind: KindFilter, slug: string | null): string => {
    switch (v) {
      case "board":
        return kind === "guardian" ? "/jobs" : "/board";
      case "area":
        return slug ? `/area/${slug}` : "/";
      case "fees":
        return "/fees";
      case "about":
        return "/about";
      case "trust":
        return "/trust";
      default:
        return "/";
    }
  };

  /* First load only: honour an incoming shareable URL (/post/<id>,
     /area/<slug>, /fees, /jobs, /board) instead of always landing home. */
  useEffect(() => {
    const path = window.location.pathname;
    const postMatch = /^\/post\/(\d+)\/?$/.exec(path);
    if (postMatch) {
      setDeepPostId(Number(postMatch[1]));
      return;
    }
    const areaMatch = /^\/area\/([a-z0-9-]+)\/?$/.exec(path);
    if (areaMatch && areaMatch[1] && areaBySlug(areaMatch[1])) {
      setAreaSlug(areaMatch[1]);
      setView("area");
      return;
    }
    if (path === "/fees" || path === "/fees/") {
      setView("fees");
      return;
    }
    if (path === "/jobs" || path === "/jobs/") {
      setFilters((f) => ({ ...f, kind: "guardian" }));
      setView("board");
      return;
    }
    if (path === "/board" || path === "/board/" || path === "/tutors" || path === "/tutors/") {
      setView("board");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Deep-linked post: fetch it and open its detail (spec P1 #8 — opening
     /post/<id> shows that post, not just the homepage). */
  const deepPostQuery = useQuery({
    queryKey: ["deepPost", deepPostId],
    queryFn: () => api.getPost({ id: deepPostId ?? 0 }),
    enabled: deepPostId != null,
    retry: false,
  });
  useEffect(() => {
    if (deepPostQuery.data?.post) setSelected(deepPostQuery.data.post);
  }, [deepPostQuery.data]);

  const openPost = (post: Post) => {
    setSelected(post);
    pushPath(`/post/${post.id}`);
  };
  const closePost = () => {
    setSelected(null);
    pushPath(pathForView(view, filters.kind, areaSlug));
  };

  const goView = (v: View) => {
    setMenuOpen(false);
    setView(v);
    pushPath(pathForView(v, filters.kind, areaSlug));
  };

  const goArea = (slug: string) => {
    setMenuOpen(false);
    setAreaSlug(slug);
    setView("area");
    pushPath(`/area/${slug}`);
  };

  const goFees = () => {
    setMenuOpen(false);
    setView("fees");
    pushPath("/fees");
  };

  const goBoardSubject = (subject: string) => {
    setFilters({ ...EMPTY_FILTERS, subject });
    setUniFilter(null);
    setMenuOpen(false);
    setView("board");
    pushPath("/board");
  };

  const goBoard = (kind: KindFilter = "all") => {
    setFilters((f) => ({ ...f, kind }));
    setUniFilter(null);
    setMenuOpen(false);
    setView("board");
    pushPath(kind === "guardian" ? "/jobs" : "/board");
  };

  const goPost = (kind: "guardian" | "tutor") => {
    setPostKind(kind);
    goView("post");
  };

  const goLegal = (d: "privacy" | "terms") => {
    setLegalDoc(d);
    goView("legal");
  };

  /* Header Login: opens the login view when logged out, the dashboard
     (via the tutor's name) when logged in. */
  const goLogin = () => {
    setMenuOpen(false);
    setView(tutor ? "dashboard" : "login");
  };

  const goSignup = () => {
    setMenuOpen(false);
    setView("signup");
  };

  const favIdsQuery = useQuery({
    queryKey: ["favoriteIds"],
    queryFn: () => api.listFavoriteIds({}),
  });
  const favIds = new Set(favIdsQuery.data?.favoriteIds ?? []);

  const favMutation = useMutation({
    mutationFn: async (post: Post) => await api.toggleFavorite({ postId: post.id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["favoriteIds"] });
      void queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navItems: { key: string; label: string; icon: ReactNode; onClick: () => void; active: boolean }[] = [
    { key: "home", label: t("navHome"), icon: <IconHome className="h-4 w-4" />, onClick: () => goView("home"), active: view === "home" },
    { key: "board", label: t("navBoard"), icon: <IconBoard className="h-4 w-4" />, onClick: () => goBoard("all"), active: view === "board" && filters.kind === "all" && !uniFilter },
    { key: "find", label: t("navFindTutor"), icon: <IconGradCap className="h-4 w-4" />, onClick: () => goPost("guardian"), active: view === "post" && postKind === "guardian" },
    { key: "jobs", label: t("navJobs"), icon: <IconBookmark className="h-4 w-4" />, onClick: () => goBoard("guardian"), active: view === "board" && filters.kind === "guardian" },
    { key: "about", label: t("navAbout"), icon: <IconUser className="h-4 w-4" />, onClick: () => goView("about"), active: view === "about" },
    { key: "trust", label: t("navTrust"), icon: <IconShieldCheck className="h-4 w-4" />, onClick: () => goView("trust"), active: view === "trust" },
  ];

  const currentArea = areaSlug ? areaBySlug(areaSlug) : null;

  /* SEO manager (spec P0 #1–#3, P1 #8–#10): per-view <title>, meta
     description, canonical, Open Graph + Twitter card, and JSON-LD
     (WebSite/Organization + FAQPage where the page shows an FAQ).
     Re-runs on language change, so document.title follows the mode. */
  useEffect(() => {
    const path = window.location.pathname;
    if (path === "/admin" || path.startsWith("/admin/")) {
      applySeo({ title: "Admin — Baraka Tutors", description: HOME_DESC[lang], path: "/admin" });
      applyJsonLd(null);
      return;
    }
    if (path === "/poster" || path.startsWith("/poster/")) {
      applySeo({ title: "Poster — Baraka Tutors", description: HOME_DESC[lang], path: "/poster" });
      applyJsonLd(null);
      return;
    }
    if (selected) {
      applySeo({
        title: postSeoTitle(selected, lang),
        description: postSeoDescription(selected, lang),
        path: `/post/${selected.id}`,
        type: "article",
      });
      applyJsonLd(null);
      return;
    }
    if (view === "home") {
      applySeo({ title: HOME_TITLE[lang], description: HOME_DESC[lang], path: "/" });
      applyJsonLd([websiteJsonLd(), faqPageJsonLd(HOME_FAQ, lang)]);
    } else if (view === "board") {
      const jobs = filters.kind === "guardian";
      applySeo({
        title: jobs ? JOBS_TITLE[lang] : BOARD_TITLE[lang],
        description: jobs
          ? lang === "en"
            ? "Tuition jobs in Rangpur — browse guardians' tuition posts and apply. Dhap, Lalbagh, Modern Mor and every area of Rangpur."
            : "রংপুরে টিউশন জব — গার্ডিয়ানদের টিউশন পোস্ট দেখুন ও আবেদন করুন। ধাপ, লালবাগ, মর্ডান মোড়সহ রংপুরের সব এলাকায়।"
          : HOME_DESC[lang],
        path: jobs ? "/jobs" : "/board",
      });
      applyJsonLd(null);
    } else if (view === "area" && currentArea) {
      applySeo({
        title: areaTitle(currentArea, lang),
        description:
          lang === "en"
            ? `Find home tutors in ${currentArea.en}, Rangpur — current tuition posts, approximate fees and FAQs for the ${currentArea.en} area on Baraka Tutors.`
            : `${currentArea.bn} এলাকায় হোম টিউটর খুঁজুন — Baraka Tutors-এ এই এলাকার বর্তমান টিউশন পোস্ট, আনুমানিক ফি ও প্রশ্নোত্তর।`,
        path: `/area/${currentArea.slug}`,
      });
      applyJsonLd(faqPageJsonLd(areaFaq(currentArea), lang));
    } else if (view === "fees") {
      applySeo({
        title: FEES_TITLE[lang],
        description:
          lang === "en"
            ? "Home tutor fees in Rangpur: approximately ৳2,500–8,000 per month — class-by-class approximate fee table and a full guide on Baraka Tutors."
            : "রংপুরে হোম টিউটরের মাসিক বেতন আনুমানিক ৳২,৫০০–৮,০০০ — শ্রেণি অনুযায়ী আনুমানিক ফি-তালিকা ও পুরো গাইড Baraka Tutors-এ।",
        path: "/fees",
      });
      applyJsonLd(faqPageJsonLd(FEES_FAQ, lang));
    } else {
      applySeo({
        title: HOME_TITLE[lang],
        description: HOME_DESC[lang],
        path: pathForView(view, filters.kind, areaSlug),
      });
      applyJsonLd(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, lang, selected, currentArea, filters.kind, areaSlug]);

  // Separate admin area: /admin renders ONLY the admin panel — no public
  // header, board, post form, footer or chat widget. The passcode flow is
  // unchanged (AdminPanel asks for it first). There is no link, button,
  // tab or mention of /admin anywhere on the public site — it is
  // reachable only by direct URL.
  const isAdminRoute =
    window.location.pathname === "/admin" ||
    window.location.pathname.startsWith("/admin/");
  if (isAdminRoute) {
    return (
      <div className="min-h-screen bg-[var(--bg)] pb-24 text-[var(--text)]">
        <main className="mx-auto max-w-4xl px-4 pt-6">
          <AdminPanel />
        </main>
      </div>
    );
  }

  // Separate poster area: /poster renders ONLY the PosterPanel — no
  // public site around it, and no link, button, tab or mention of
  // /poster anywhere on the public site. Reachable only by direct URL.
  const isPosterRoute =
    window.location.pathname === "/poster" ||
    window.location.pathname.startsWith("/poster/");
  if (isPosterRoute) {
    return (
      <div className="min-h-screen bg-[var(--bg)] pb-24 text-[var(--text)]">
        <main className="mx-auto max-w-4xl px-4 pt-6">
          <PosterPanel />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] pb-24 text-[var(--text)]">
      <SafeAreaTopScrim backgroundColor="var(--header-bg)" />

      {/* Header — blue bar at the top; once scrolled it morphs into a
          floating frosted rounded pill. Logo left, nav centre, buttons
          right; on small screens the nav collapses into a hamburger menu. */}
      <header
        className={`sticky z-40 pt-safe transition-all duration-300 ${
          scrolled
            ? "top-3 mx-3 rounded-3xl border border-white/25 bg-[var(--header-bg)]/80 px-4 pb-3 shadow-[0_10px_30px_rgba(30,140,200,0.35)] backdrop-blur-xl sm:mx-4"
            : "top-0 border-b border-[var(--teal-bright)] bg-[var(--header-bg)] px-4 pb-3"
        }`}
      >
        <div className="mx-auto max-w-6xl pt-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => goView("home")}
              className="flex min-w-0 items-center gap-3 text-left"
              aria-label={t("appName")}
            >
              <img
                src={barakaLogo}
                alt=""
                className="h-12 w-12 shrink-0 rounded-2xl bg-white object-contain p-1 shadow-[0_4px_14px_rgba(0,0,0,0.3)] ring-2 ring-[var(--teal-bright)] sm:h-14 sm:w-14"
              />
              <span className="min-w-0">
                <span className="block truncate text-lg font-bold leading-tight text-white sm:text-2xl">{t("appName")}</span>
                <span className="block text-xs font-medium tracking-wide text-white/70">{t("appSub")}</span>
              </span>
            </button>

            {/* Centre nav — desktop */}
            <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex" aria-label={t("mainMenu")}>
              {navItems.map((n) => (
                <button
                  key={n.key}
                  type="button"
                  aria-current={n.active ? "page" : undefined}
                  onClick={n.onClick}
                  className={`flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold ${
                    n.active ? "bg-white text-[var(--header-bg)]" : "bg-white/15 text-white"
                  }`}
                >
                  {n.icon} {n.label}
                </button>
              ))}
            </nav>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={goSignup}
                className="hidden rounded-full bg-white px-4 py-2 text-sm font-bold text-[#157aad] sm:inline-flex"
              >
                {t("becomeTutorBtn")}
              </button>
              <button
                type="button"
                onClick={goLogin}
                className="hidden items-center gap-1.5 rounded-full border border-white/60 px-4 py-2 text-sm font-semibold text-white sm:inline-flex"
              >
                <IconUser className="h-4 w-4 shrink-0" />
                {tutor ? (
                  <span className="max-w-32 truncate">{tutor.name}</span>
                ) : (
                  t("headerLoginBtn")
                )}
              </button>
              <div
                className="flex overflow-hidden rounded-full border border-white/40"
                role="group"
                aria-label={t("languageLabel")}
              >
                <button
                  type="button"
                  aria-pressed={lang === "bn"}
                  onClick={() => setLang("bn")}
                  className={`px-2.5 py-1.5 text-sm font-semibold ${
                    lang === "bn" ? "bg-white text-[var(--header-bg)]" : "text-white"
                  }`}
                >
                  বাংলা
                </button>
                <button
                  type="button"
                  aria-pressed={lang === "en"}
                  onClick={() => setLang("en")}
                  className={`px-2.5 py-1.5 text-sm font-semibold ${
                    lang === "en" ? "bg-white text-[var(--header-bg)]" : "text-white"
                  }`}
                >
                  English
                </button>
              </div>
              <button
                type="button"
                aria-label={t("menuAria")}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white lg:hidden"
              >
                {menuOpen ? <IconX className="h-5 w-5" /> : <IconSliders className="h-5 w-5" />}
              </button>
            </div>
          </div>
          {menuOpen ? (
            <nav className="mt-3 flex flex-col gap-1 rounded-2xl bg-white/10 p-2 lg:hidden" aria-label={t("mainMenu")}>
              {navItems.map((n) => (
                <button
                  key={n.key}
                  type="button"
                  aria-current={n.active ? "page" : undefined}
                  onClick={n.onClick}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${
                    n.active ? "bg-white text-[var(--header-bg)]" : "text-white"
                  }`}
                >
                  {n.icon} {n.label}
                </button>
              ))}
              <button
                type="button"
                onClick={goSignup}
                className="mt-1 flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-left text-sm font-bold text-[#157aad]"
              >
                <IconGradCap className="h-4 w-4" /> {t("becomeTutorBtn")}
              </button>
              <button
                type="button"
                onClick={goLogin}
                className="flex items-center gap-2 rounded-xl border border-white/60 px-3 py-2.5 text-left text-sm font-semibold text-white"
              >
                <IconUser className="h-4 w-4" />{" "}
                {tutor ? <span className="truncate">{tutor.name}</span> : t("headerLoginBtn")}
              </button>
              {tutor ? (
                <button
                  type="button"
                  onClick={() => goView("dashboard")}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-white"
                >
                  <IconBoard className="h-4 w-4" /> {t("navDashboard")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => goView("favorites")}
                className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-white"
              >
                <IconHeart className="h-4 w-4" /> {t("navFavorites")}
              </button>
            </nav>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-4">
        {view === "home" ? (
          <Home
            onFindTutor={() => goPost("guardian")}
            onBrowseJobs={() => goBoard("guardian")}
            onBecomeTutor={goSignup}
            onSelectUni={(name) => {
              setUniFilter(name);
              setFilters((f) => ({ ...f, kind: "all" }));
              goView("board");
            }}
            onOpenArea={goArea}
            onOpenFees={goFees}
          />
        ) : null}
        {view === "board" ? (
          <div className="mx-auto max-w-4xl">
            <Board
              filters={filters}
              setFilters={setFilters}
              onOpen={openPost}
              institutionFilter={uniFilter}
              onClearInstitution={() => setUniFilter(null)}
            />
          </div>
        ) : null}
        {view === "post" ? (
          <div className="mx-auto max-w-4xl">
            <PostForm
              key={`${postKind}-${tutor?.phone ?? ""}`}
              initialKind={postKind}
              prefill={postKind === "tutor" && tutor ? { name: tutor.name, phone: tutor.phone } : null}
              onDone={() => goView("board")}
            />
          </div>
        ) : null}
        {view === "signup" ? (
          <div className="mx-auto max-w-4xl">
            <TutorSignup onAuthed={handleTutorAuthed} onGoLogin={() => setView("login")} />
          </div>
        ) : null}
        {view === "login" ? (
          <div className="mx-auto max-w-4xl">
            <TutorLogin onAuthed={handleTutorAuthed} onGoSignup={() => setView("signup")} />
          </div>
        ) : null}
        {view === "dashboard" ? (
          tutor && tutorToken ? (
            <TutorDashboard
              tutor={tutor}
              token={tutorToken}
              onLogout={handleTutorLogout}
              onOpenPost={openPost}
              onNewOffer={() => goPost("tutor")}
            />
          ) : tutorToken ? (
            <p className="py-10 text-center text-[var(--dim)]">{t("loadingShort")}</p>
          ) : (
            <div className="mx-auto max-w-4xl">
              <TutorLogin onAuthed={handleTutorAuthed} onGoSignup={() => setView("signup")} />
            </div>
          )
        ) : null}
        {view === "favorites" ? (
          <div className="mx-auto max-w-4xl">
            <Favorites onOpen={openPost} />
          </div>
        ) : null}
        {view === "about" ? <AboutView /> : null}
        {view === "trust" ? <TrustCheckView onOpen={openPost} /> : null}
        {view === "area" && currentArea ? (
          <AreaView
            area={currentArea}
            onOpen={openPost}
            onFindTutor={() => goPost("guardian")}
            onPickSubject={goBoardSubject}
          />
        ) : null}
        {view === "fees" ? (
          <FeesView onFindTutor={() => goPost("guardian")} onPickSubject={goBoardSubject} />
        ) : null}
        {view === "legal" ? <LegalView doc={legalDoc} onChange={setLegalDoc} /> : null}
      </main>

      <SiteFooter onNavigate={goView} onLegal={goLegal} onOpenArea={goArea} onOpenFees={goFees} />

      {/* Mobile bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--surface)] pb-safe sm:hidden"
        aria-label={t("mainMenu")}
      >
        <div className="grid grid-cols-4">
          {(
            [
              { v: "home" as View, label: t("navHome"), icon: <IconHome className="h-5 w-5" /> },
              { v: "board" as View, label: t("navBoard"), icon: <IconBoard className="h-5 w-5" /> },
              { v: "post" as View, label: t("navPost"), icon: <IconPlusCircle className="h-5 w-5" /> },
              { v: "favorites" as View, label: t("navFavorites"), icon: <IconHeart className="h-5 w-5" /> },
            ]
          ).map((n) => (
            <button
              key={n.v}
              type="button"
              aria-current={view === n.v ? "page" : undefined}
              onClick={() => (n.v === "post" ? goPost("guardian") : n.v === "board" ? goBoard("all") : goView(n.v))}
              className={`flex flex-col items-center gap-0.5 py-2 text-xs font-semibold ${
                view === n.v ? "text-[var(--accent-strong)]" : "text-[var(--dim)]"
              }`}
            >
              <span className="inline-flex h-5 w-5 items-center justify-center">
                {n.v === "favorites" ? (
                  <IconHeart filled={view === n.v} className="h-5 w-5" />
                ) : (
                  n.icon
                )}
              </span>
              {n.label}
            </button>
          ))}
        </div>
      </nav>

      {selected ? (
        <PostDetail
          post={selected}
          isFavorite={favIds.has(selected.id)}
          onClose={closePost}
          onToggleFavorite={(p) => favMutation.mutate(p)}
        />
      ) : null}

      <ChatWidget />
    </div>
  );
}
