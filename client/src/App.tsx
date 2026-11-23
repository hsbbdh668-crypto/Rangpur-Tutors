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
import { useLang } from "./i18n";
import barakaLogo from "./assets/baraka-logo.webp";

const FIELDS = actionFields<typeof Actions>();

setFailureNoticeText((_error, message) => message);

type AdminStats = ApiResponse<typeof api, "adminStats">;
type AdminApplication = ApiResponse<typeof api, "adminListApplications">["applications"][number];
type AdminReport = ApiResponse<typeof api, "adminListReports">["reports"][number];
type ChatMessage = ApiResponse<typeof api, "chatPoll">["messages"][number];

type Tab = "board" | "post" | "favorites" | "admin";
type KindFilter = "all" | "guardian" | "tutor";

interface BoardFilters {
  kind: KindFilter;
  query: string;
  subject: string;
  classLevel: string;
  area: string;
  mode: "" | "home" | "online" | "both";
  medium: "" | "bangla" | "english" | "both";
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
  minSalary: "",
  maxSalary: "",
  sort: "newest",
};

/* ---------------- small UI helpers ---------------- */

function Chip({ children, tone = "soft" }: { children: ReactNode; tone?: "soft" | "amber" | "green" }) {
  const cls =
    tone === "amber"
      ? "bg-[var(--amber-soft)] text-[var(--amber)]"
      : tone === "green"
        ? "bg-[var(--teal-soft)] text-[var(--teal-strong)]"
        : "bg-[var(--surface-2)] text-[var(--dim)]";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
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
}: {
  post: Post;
  isFavorite: boolean;
  onOpen: (post: Post) => void;
  onToggleFavorite: (post: Post) => void;
}) {
  const { lang, t } = useLang();
  const num = (n: number | string) => fmtNum(n, lang);
  const isGuardian = post.kind === "guardian";
  return (
    <article className="flex flex-col rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_1px_2px_rgba(46,16,101,0.06)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone={isGuardian ? "amber" : "green"}>
            {isGuardian ? t("chipGuardian") : t("chipTutor")}
          </Chip>
          {post.featured ? <Chip tone="amber">{t("chipFeatured")}</Chip> : null}
          {post.verified ? <Chip tone="green">{t("chipVerifiedTutor")}</Chip> : null}
        </div>
        <button
          type="button"
          aria-label={isFavorite ? t("favRemoveAria") : t("favAddAria")}
          aria-pressed={isFavorite}
          onClick={() => onToggleFavorite(post)}
          className="shrink-0 rounded-full px-2 text-xl leading-none"
        >
          {isFavorite ? "❤️" : "🤍"}
        </button>
      </div>

      <button type="button" onClick={() => onOpen(post)} className="mt-2 text-left">
        <h3 className="text-lg font-semibold leading-snug text-[var(--text)]">{post.title}</h3>
      </button>

      <p className="mt-1 text-sm text-[var(--dim)]">
        {post.authorName}
        {post.institution ? ` · ${post.institution}` : ""} · 📍 {areaLabel(post.area, lang)} · {timeAgo(post.createdAt, lang)}
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
        <div className="flex flex-wrap gap-2">
          <a
            href={`tel:${post.phone.replace(/\s/g, "")}`}
            aria-label={t("callAria", { name: post.authorName })}
            className="rounded-full border border-[var(--accent)] px-3.5 py-1.5 text-sm font-semibold text-[var(--accent-strong)]"
          >
            {t("callBtn")}
          </a>
          <button
            type="button"
            onClick={() => onOpen(post)}
            className="rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-sm font-semibold text-white"
          >
            {t("detailsBtn")}
          </button>
        </div>
      </div>
    </article>
  );
}

/* ---------------- board ---------------- */

function Board({
  filters,
  setFilters,
  onOpen,
}: {
  filters: BoardFilters;
  setFilters: (f: BoardFilters) => void;
  onOpen: (post: Post) => void;
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
  const posts = postsQuery.data?.posts ?? [];
  const activeFilterCount = [
    filters.subject,
    filters.classLevel,
    filters.area,
    filters.mode,
    filters.medium,
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
      {configQuery.data?.notice ? (
        <div className="mb-4 rounded-[var(--radius)] bg-[var(--amber-soft)] px-4 py-3 text-sm font-medium text-[var(--text)]">
          📢 {configQuery.data.notice}
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
            {t("filtersBtn")}{activeFilterCount ? ` (${num(activeFilterCount)})` : ""} {showFilters ? "▲" : "▼"}
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
                  {t("saveSearchBtn")}
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
            <Chip tone={isGuardian ? "amber" : "green"}>
              {isGuardian ? t("chipGuardian") : t("chipTutor")}
            </Chip>
            {post.featured ? <Chip tone="amber">{t("chipFeatured")}</Chip> : null}
            {post.verified ? <Chip tone="green">{t("chipVerifiedTutor")}</Chip> : null}
          </div>
          <button
            type="button"
            aria-label={t("closeAria")}
            onClick={onClose}
            className="rounded-full bg-[var(--surface-2)] px-3 text-lg leading-none"
          >
            ✕
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

        <div className="mt-5 flex flex-wrap gap-2">
          <a
            href={`tel:${post.phone.replace(/\s/g, "")}`}
            className="flex-1 rounded-full bg-[var(--accent)] px-4 py-2.5 text-center text-base font-semibold text-white"
          >
            {t("callNow", { phone: post.phone })}
          </a>
          <button
            type="button"
            aria-pressed={isFavorite}
            onClick={() => onToggleFavorite(post)}
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-base font-semibold text-[var(--text)]"
          >
            {isFavorite ? t("favInBtn") : t("favAddBtn")}
          </button>
        </div>

        {/* Apply / contact */}
        <div className="mt-6 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <h3 className="text-base font-bold text-[var(--text)]">
            {isGuardian ? t("applyHeadingGuardian") : t("applyHeadingTutor")}
          </h3>
          {applyDone ? (
            <p className="mt-2 rounded-[var(--radius)] bg-[var(--accent-soft)] px-3 py-2.5 text-sm font-medium text-[var(--accent-strong)]">
              {t("applyDoneMsg")}
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

        {/* Report */}
        <div className="mt-4 text-center">
          {reportDone ? (
            <p className="text-sm font-medium text-[var(--accent-strong)]">
              {t("reportDoneMsg")}
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
              {t("reportLink")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- create post ---------------- */

function PostForm({ onDone }: { onDone: () => void }) {
  const { lang, t } = useLang();
  const num = (n: number | string) => fmtNum(n, lang);
  const queryClient = useQueryClient();
  const configQuery = useQuery({ queryKey: ["config"], queryFn: () => api.getConfig({}) });
  const [kind, setKind] = useState<"guardian" | "tutor">("guardian");
  const [authorName, setAuthorName] = useState("");
  const [phone, setPhone] = useState("");
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

  if (doneStatus) {
    return (
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 py-10 text-center">
        <p className="text-4xl">✅</p>
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
            {o.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <>
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
            <Field label={t("availabilityLabel")}>
              <input
                {...FIELDS.createPost.availability}
                className={inputCls}
                value={availability}
                onChange={(e) => setAvailability(e.target.value)}
                placeholder={t("availabilityPh")}
              />
            </Field>
          </>
        )}
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
      </div>

      {error ? <p className="mt-4 text-sm font-medium text-[var(--danger)]">{error}</p> : null}
      <button
        type="submit"
        disabled={mutation.isPending}
        className="mt-5 w-full rounded-full bg-[var(--accent)] px-5 py-3 text-base font-bold text-white disabled:opacity-60 sm:w-auto"
      >
        {mutation.isPending ? t("submitting") : t("submitPostBtn")}
      </button>
    </form>
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

function AdminPanel() {
  const { lang, t } = useLang();
  const num = (n: number | string) => fmtNum(n, lang);
  const queryClient = useQueryClient();
  const [passcode, setPasscode] = useState(() => sessionStorage.getItem("rt-admin") ?? "");
  const [entered, setEntered] = useState("");
  const [loginError, setLoginError] = useState("");
  const [section, setSection] = useState<"posts" | "applications" | "reports" | "chats" | "settings">("posts");
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
        <h2 className="text-xl font-bold text-[var(--text)]">{t("adminLoginTitle")}</h2>
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
      label: t("tabPosts") + (stats?.pending ? t("tabPostsPendingSuffix", { n: num(stats.pending) }) : ""),
    },
    {
      v: "applications" as const,
      label: t("tabApplications") + (stats?.newApplications ? t("tabAppsNewSuffix", { n: num(stats.newApplications) }) : ""),
    },
    {
      v: "reports" as const,
      label: t("tabReports") + (stats?.openReports ? t("tabReportsSuffix", { n: num(stats.openReports) }) : ""),
    },
    {
      v: "chats" as const,
      label: t("tabChats") + (chatsNeedingAdmin ? t("tabChatsSuffix", { n: num(chatsNeedingAdmin) }) : ""),
    },
    { v: "settings" as const, label: t("tabSettings") },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-[var(--text)]">{t("adminPanelTitle")}</h2>
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
            {t.label}
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
                    <Chip tone={p.kind === "guardian" ? "amber" : "green"}>
                      {p.kind === "guardian" ? t("guardianWord") : t("tutorWord")}
                    </Chip>
                    <Chip
                      tone={p.status === "approved" ? "green" : p.status === "pending" ? "amber" : "soft"}
                    >
                      {p.status === "approved"
                        ? t("statusApproved")
                        : p.status === "pending"
                          ? t("statusPending")
                          : p.status === "rejected"
                            ? t("statusRejected")
                            : t("statusClosed")}
                    </Chip>
                    {p.featured ? <Chip tone="amber">{t("chipFeatured")}</Chip> : null}
                    {p.verified ? <Chip tone="green">{t("chipVerifiedShort")}</Chip> : null}
                    <span className="ml-auto text-xs text-[var(--dim)]">
                      {fullDate(p.createdAt, lang)} · {t("applicationsCount", { n: num(p.applicationCount) })}
                    </span>
                  </div>
                  <h3 className="mt-2 font-semibold text-[var(--text)]">{p.title}</h3>
                  <p className="mt-0.5 text-sm text-[var(--dim)]">
                    {p.authorName} · {p.phone} · 📍 {areaLabel(p.area, lang)} · {salaryText(p, lang)}
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
                        {t("approveBtn")}
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
                      {p.featured ? t("featuredRemoveBtn") : t("featuredAddBtn")}
                    </button>
                    {p.kind === "tutor" ? (
                      <button
                        type="button"
                        aria-pressed={p.verified}
                        onClick={() => flagsMutation.mutate({ id: p.id, verified: !p.verified })}
                        className="rounded-full border border-[var(--border)] px-3.5 py-1.5 text-sm font-semibold text-[var(--text)]"
                      >
                        {p.verified ? t("verifyRemoveBtn") : t("verifyTutorBtn")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setEditing(p)}
                      className="rounded-full border border-[var(--border)] px-3.5 py-1.5 text-sm font-semibold text-[var(--text)]"
                    >
                      {t("editBtn")}
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
                        {t("deleteBtn")}
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
                  <Chip tone={a.status === "new" ? "amber" : a.status === "accepted" ? "green" : "soft"}>
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
                  <Chip tone={r.status === "open" ? "amber" : "soft"}>
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
  const [title, setTitle] = useState(post.title);
  const [authorName, setAuthorName] = useState(post.authorName);
  const [phone, setPhone] = useState(post.phone);
  const [area, setArea] = useState(post.area);
  const [salaryMin, setSalaryMin] = useState(post.salaryMin != null ? String(post.salaryMin) : "");
  const [salaryMax, setSalaryMax] = useState(post.salaryMax != null ? String(post.salaryMax) : "");
  const [negotiable, setNegotiable] = useState(post.salaryNegotiable);
  const [description, setDescription] = useState(post.description);
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: async () =>
      await api.adminUpdatePost({
        passcode,
        id: post.id,
        title: title.trim(),
        authorName: authorName.trim(),
        phone: phone.trim(),
        area,
        salaryMin: salaryMin ? Number(salaryMin) : null,
        salaryMax: salaryMax ? Number(salaryMax) : null,
        salaryNegotiable: negotiable,
        description: description.trim(),
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
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-[var(--bg)] p-5 sm:rounded-3xl"
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
          <h3 className="text-lg font-bold text-[var(--text)]">{t("editPostTitle")}</h3>
          <button type="button" aria-label={t("closeAria")} onClick={onClose} className="rounded-full bg-[var(--surface-2)] px-3">
            ✕
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3">
          <Field label={t("fTitle")}>
            <input {...FIELDS.adminUpdatePost.title} className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label={t("fName")}>
            <input {...FIELDS.adminUpdatePost.authorName} className={inputCls} value={authorName} onChange={(e) => setAuthorName(e.target.value)} />
          </Field>
          <Field label={t("fMobile")}>
            <input {...FIELDS.adminUpdatePost.phone} type="tel" className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
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
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("fMinSalary")}>
              <input {...FIELDS.adminUpdatePost.salaryMin} type="number" inputMode="numeric" aria-label={t("fMinSalary")} className={inputCls} value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} />
            </Field>
            <Field label={t("fMaxSalary")}>
              <input {...FIELDS.adminUpdatePost.salaryMax} type="number" inputMode="numeric" aria-label={t("fMaxSalary")} className={inputCls} value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-[var(--text)]">
            <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={negotiable} onChange={(e) => setNegotiable(e.target.checked)} />
            {t("salaryNegotiable")}
          </label>
          <Field label={t("fDescription")}>
            <textarea {...FIELDS.adminUpdatePost.description} className={inputCls} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-full bg-[var(--accent)] px-5 py-2.5 font-semibold text-white disabled:opacity-60"
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
          🔐 {t("passcodeEnvHint")}
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
        <p className="text-sm font-bold text-[var(--text)]">{t("deployTitle")}</p>
        <p className="mt-1 text-sm text-[var(--dim)]">{t("deployBody")}</p>
        <a
          href="https://barakatutors.vercel.app"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-sm font-semibold text-[var(--accent-strong)] underline"
        >
          {t("liveSiteLink")}
        </a>
      </div>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {msg ? <p className="text-sm font-medium text-[var(--accent-strong)]">{msg}</p> : null}
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
                    ? `🤖 ${t("chatSenderAi")}`
                    : `🧑 ${t("chatSenderAdmin")}`}
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
      <button
        type="button"
        aria-label={t("chatOpenAria")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-24 right-3 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--teal)] text-2xl shadow-[0_8px_24px_rgba(13,148,136,0.45)] ring-2 ring-white sm:bottom-6 sm:right-6"
      >
        {open ? "✕" : "💬"}
      </button>

      {open ? (
        <section
          aria-label={t("chatTitle")}
          className="fixed inset-x-3 bottom-40 z-50 flex h-[min(540px,62vh)] flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_50px_rgba(30,20,51,0.35)] sm:inset-x-auto sm:bottom-24 sm:right-6 sm:h-[540px] sm:w-[380px]"
        >
          <header className="shrink-0 bg-[var(--header-bg)] px-4 py-3">
            <p className="text-base font-bold text-white">{t("chatTitle")}</p>
            <p className="text-xs text-white/75">{subtitle}</p>
          </header>

          {conversationId == null ? (
            <div className="flex flex-1 flex-col justify-center gap-3 p-5">
              <p className="text-center text-4xl">💬</p>
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
                  <p className="mt-3 text-center text-xs font-semibold text-[var(--amber)]">
                    {t("chatEscalated")}
                  </p>
                ) : null}
                {waiting ? (
                  <p className="mt-3 text-center text-xs font-medium text-[var(--dim)]">
                    {t("chatWaitingAdmin")}
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
                  ➤
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
          🤖 {t("chatAiToggleLabel")}
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
          {(configQuery.data?.chatAiEnabled ?? true) ? t("chatModeAi") : t("chatSubtitleOff")}
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
                    {c.mode === "admin" ? t("chatModeAdmin") : t("chatModeAi")}
                  </Chip>
                  {c.needsAdmin ? <Chip tone="amber">{t("chatNeedsAdmin")}</Chip> : null}
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
              {t("chatBackBtn")}
            </button>
            <div className="min-w-0">
              <p className="truncate font-bold text-[var(--text)]">
                {selected?.visitorName || t("chatVisitorAnon")}
                {selected?.visitorPhone ? ` · ${selected.visitorPhone}` : ""}
              </p>
              <p className="text-xs text-[var(--dim)]">
                {selected?.mode === "admin" ? t("chatModeAdmin") : t("chatModeAi")}
                {selected?.needsAdmin ? ` · ${t("chatNeedsAdmin")}` : ""}
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

/* ---------------- app shell ---------------- */

export function App() {
  const { lang, setLang, t } = useLang();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("board");
  const [filters, setFilters] = useState<BoardFilters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<Post | null>(null);

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

  const navItems: { v: Tab; label: string; icon: string }[] = [
    { v: "board", label: t("navBoard"), icon: "📋" },
    { v: "post", label: t("navPost"), icon: "➕" },
    { v: "favorites", label: t("navFavorites"), icon: "❤️" },
    { v: "admin", label: t("navAdmin"), icon: "🛠️" },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg)] pb-24 text-[var(--text)]">
      <SafeAreaTopScrim backgroundColor="var(--header-bg)" />

      {/* Header band — deep purple from logo #4, with teal swoosh accent */}
      <header className="border-b-4 border-[var(--teal-bright)] bg-[var(--header-bg)] px-4 pb-5 pt-safe">
        <div className="mx-auto max-w-4xl pt-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <img
                src={barakaLogo}
                alt=""
                className="h-14 w-14 shrink-0 rounded-2xl bg-white object-contain p-1 shadow-[0_4px_14px_rgba(0,0,0,0.3)] ring-2 ring-[var(--teal-bright)]"
              />
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-tight text-white min-[400px]:text-2xl">{t("appName")}</h1>
                <p className="text-xs font-medium tracking-wide text-white/70">{t("appSub")}</p>
              </div>
            </div>
            <div
              className="flex shrink-0 overflow-hidden rounded-full border border-white/40"
              role="group"
              aria-label={t("languageLabel")}
            >
              <button
                type="button"
                aria-pressed={lang === "bn"}
                onClick={() => setLang("bn")}
                className={`px-3 py-1.5 text-sm font-semibold ${
                  lang === "bn" ? "bg-white text-[var(--header-bg)]" : "text-white"
                }`}
              >
                বাংলা
              </button>
              <button
                type="button"
                aria-pressed={lang === "en"}
                onClick={() => setLang("en")}
                className={`px-3 py-1.5 text-sm font-semibold ${
                  lang === "en" ? "bg-white text-[var(--header-bg)]" : "text-white"
                }`}
              >
                English
              </button>
            </div>
          </div>
          <p className="mt-3 text-sm text-white/85">{t("tagline")}</p>
          <div className="mt-3 hidden flex-wrap gap-2 sm:flex" role="tablist" aria-label={t("mainMenu")}>
            {navItems.map((n) => (
              <button
                key={n.v}
                type="button"
                role="tab"
                aria-selected={tab === n.v}
                onClick={() => setTab(n.v)}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  tab === n.v ? "bg-white text-[var(--header-bg)]" : "bg-white/15 text-white"
                }`}
              >
                {n.icon} {n.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pt-4">
        {tab === "board" ? (
          <Board filters={filters} setFilters={setFilters} onOpen={setSelected} />
        ) : null}
        {tab === "post" ? <PostForm onDone={() => setTab("board")} /> : null}
        {tab === "favorites" ? <Favorites onOpen={setSelected} /> : null}
        {tab === "admin" ? <AdminPanel /> : null}

        <footer className="mt-10 border-t border-[var(--border)] pt-5 pb-2 text-center text-xs text-[var(--dim)]">
          <img
            src={barakaLogo}
            alt=""
            className="mx-auto h-11 w-11 rounded-xl bg-white object-contain p-0.5 shadow-sm ring-1 ring-[var(--border)]"
          />
          <p className="mt-2 font-semibold text-[var(--text)]">{t("appName")}</p>
          <p className="mt-1">{t("footerLine1")}</p>
          <p className="mt-1">{t("footerLine2")}</p>
          <p className="mt-2">
            <a
              href="https://barakatutors.vercel.app"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[var(--accent-strong)] underline"
            >
              {t("liveSiteLink")}
            </a>
          </p>
        </footer>
      </main>

      {/* Mobile bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--surface)] pb-safe sm:hidden"
        aria-label={t("mainMenu")}
      >
        <div className="grid grid-cols-4">
          {navItems.map((n) => (
            <button
              key={n.v}
              type="button"
              aria-current={tab === n.v ? "page" : undefined}
              onClick={() => setTab(n.v)}
              className={`flex flex-col items-center gap-0.5 py-2 text-xs font-semibold ${
                tab === n.v ? "text-[var(--accent-strong)]" : "text-[var(--dim)]"
              }`}
            >
              <span className="text-xl leading-none">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </div>
      </nav>

      {selected ? (
        <PostDetail
          post={selected}
          isFavorite={favIds.has(selected.id)}
          onClose={() => setSelected(null)}
          onToggleFavorite={(p) => favMutation.mutate(p)}
        />
      ) : null}

      <ChatWidget />
    </div>
  );
}
