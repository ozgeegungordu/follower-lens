import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  analyzeRelationships,
  parseInstagramFile,
} from "./lib/instagramExport";

import { downloadUsernames } from "./lib/export";

import { scanInstagramFollowing } from "./live/instagramScanner";

import { scanInstagramFollowers } from "./live/instagramFollowersScanner";

import {
  analyzeLiveRelationships,
  type LiveRelationshipAnalysis,
} from "./live/relationshipAnalysis";

import {
  processFollowerHistory,
  type FollowerHistoryUpdate,
} from "./history/followerHistory";

import type {
  InstagramPerson,
  RelationshipTab,
} from "./types";

import type {
  LiveFollowersScanResult,
  LiveInstagramUser,
  LiveScanResult,
} from "./live/instagramTypes";

declare const chrome: any;

type LiveStatus =
  | "idle"
  | "checking"
  | "scanning"
  | "ready"
  | "wrong-tab"
  | "error";

type FileKind =
  | "followers"
  | "following";

type LiveTab =
  | "not-following-back"
  | "mutual"
  | "fans"
  | "recent-unfollowers";

const tabConfig: Array<{
  id: RelationshipTab;
  short: string;
}> = [
  {
    id: "not-following-back",
    short: "Unfollowers",
  },
  {
    id: "mutual",
    short: "Mutual",
  },
  {
    id: "fans",
    short: "Fans",
  },
];

function Icon({
  name,
}: {
  name:
    | "search"
    | "upload"
    | "download"
    | "shield"
    | "sparkle"
    | "close";
}) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (name === "search") {
    return (
      <svg {...common}>
        <circle
          cx="11"
          cy="11"
          r="7"
        />
        <path d="m20 20-3.2-3.2" />
      </svg>
    );
  }

  if (name === "upload") {
    return (
      <svg {...common}>
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M5 20h14" />
      </svg>
    );
  }

  if (name === "download") {
    return (
      <svg {...common}>
        <path d="M12 4v12" />
        <path d="m7 11 5 5 5-5" />
        <path d="M5 20h14" />
      </svg>
    );
  }

  if (name === "shield") {
    return (
      <svg {...common}>
        <path d="M12 3 5 6v5c0 4.6 2.9 8 7 10 4.1-2 7-5.4 7-10V6l-7-3Z" />
        <path d="m9.5 12 1.7 1.7 3.6-4" />
      </svg>
    );
  }

  if (name === "close") {
    return (
      <svg {...common}>
        <path d="m7 7 10 10M17 7 7 17" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" />
      <path d="m18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z" />
    </svg>
  );
}

function App() {
  const [followers, setFollowers] =
    useState<InstagramPerson[]>([]);

  const [following, setFollowing] =
    useState<InstagramPerson[]>([]);

  const [
    followersName,
    setFollowersName,
  ] = useState("");

  const [
    followingName,
    setFollowingName,
  ] = useState("");

  const [tab, setTab] =
    useState<RelationshipTab>(
      "not-following-back",
    );

  const [liveTab, setLiveTab] =
    useState<LiveTab>(
      "not-following-back",
    );

  const [query, setQuery] =
    useState("");

  const [error, setError] =
    useState("");

  const [
    loadingKind,
    setLoadingKind,
  ] = useState<FileKind | null>(
    null,
  );

  const [
    liveStatus,
    setLiveStatus,
  ] = useState<LiveStatus>(
    "idle",
  );

  const [
    liveMessage,
    setLiveMessage,
  ] = useState("");

  const [
    liveResult,
    setLiveResult,
  ] =
    useState<LiveScanResult | null>(
      null,
    );

  const [
    liveFollowersResult,
    setLiveFollowersResult,
  ] =
    useState<LiveFollowersScanResult | null>(
      null,
    );

  const [
    followerHistory,
    setFollowerHistory,
  ] =
    useState<FollowerHistoryUpdate | null>(
      null,
    );

  const followersInput =
    useRef<HTMLInputElement>(null);

  const followingInput =
    useRef<HTMLInputElement>(null);

  const analysis = useMemo(
    () =>
      analyzeRelationships(
        followers,
        following,
      ),
    [
      followers,
      following,
    ],
  );

  const fileReady =
    followers.length > 0 &&
    following.length > 0;

  const liveAnalysis =
    useMemo<LiveRelationshipAnalysis | null>(
      () => {
        if (
          !liveResult ||
          !liveFollowersResult
        ) {
          return null;
        }

        return analyzeLiveRelationships(
          liveResult,
          liveFollowersResult,
        );
      },
      [
        liveResult,
        liveFollowersResult,
      ],
    );

  const activePeople =
    useMemo(() => {
      const source =
        tab ===
        "not-following-back"
          ? analysis.notFollowingBack
          : tab === "mutual"
            ? analysis.mutual
            : analysis.fans;

      const needle =
        query
          .trim()
          .toLowerCase();

      if (!needle) {
        return source;
      }

      return source.filter(
        (person) =>
          person.username
            .toLowerCase()
            .includes(needle),
      );
    }, [
      analysis,
      query,
      tab,
    ]);

  const liveNotFollowingBack =
    liveAnalysis?.notFollowingBack ??
    [];

  const liveMutual =
    liveAnalysis?.mutual ??
    [];

  const liveFans =
    liveAnalysis?.fans ??
    [];

  const liveRecentUnfollowers =
    useMemo<LiveInstagramUser[]>(
      () =>
        followerHistory?.recent.map(
          ({ user }) => ({
            ...user,
            followsViewer: null,
          }),
        ) ?? [],
      [followerHistory],
    );

  const livePeople =
    useMemo(() => {
      const source =
        liveTab ===
        "not-following-back"
          ? liveNotFollowingBack
          : liveTab === "mutual"
            ? liveMutual
            : liveTab === "fans"
              ? liveFans
              : liveRecentUnfollowers;

      const needle =
        query
          .trim()
          .toLowerCase();

      if (!needle) {
        return source;
      }

      return source.filter(
        (person) => {
          const text =
            `${person.username} ${person.fullName}`.toLowerCase();

          return text.includes(
            needle,
          );
        },
      );
    }, [
      liveFans,
      liveMutual,
      liveNotFollowingBack,
      liveRecentUnfollowers,
      liveTab,
      query,
    ]);

  async function checkInstagramConnection() {
    setLiveStatus(
      "checking",
    );

    setLiveMessage("");

    setLiveResult(null);

    setLiveFollowersResult(
      null,
    );

    setFollowerHistory(
      null,
    );

    try {
      if (
        typeof chrome ===
          "undefined" ||
        !chrome.tabs ||
        !chrome.scripting
      ) {
        setLiveStatus(
          "error",
        );

        setLiveMessage(
          "Live Mode localhost'ta çalışmaz. Follower Lens'i Chrome uzantısından aç.",
        );

        return;
      }

      const [activeTab] =
        await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });

      if (!activeTab?.id) {
        throw new Error(
          "Aktif sekme bulunamadı.",
        );
      }

      const [injection] =
        await chrome.scripting.executeScript(
          {
            target: {
              tabId:
                activeTab.id,
            },

            func: () => {
              return {
                hostname:
                  window.location
                    .hostname,

                href:
                  window.location
                    .href,

                title:
                  document.title,
              };
            },
          },
        );

      const page =
        injection?.result;

      const isInstagram =
        page?.hostname ===
          "instagram.com" ||
        page?.hostname ===
          "www.instagram.com";

      if (!isInstagram) {
        setLiveStatus(
          "wrong-tab",
        );

        setLiveMessage(
          "Instagram sekmesi açık değil. instagram.com'u açıp Follower Lens'i tekrar çalıştır.",
        );

        return;
      }

      setLiveStatus(
        "ready",
      );

      setLiveMessage(
        `Instagram bağlantısı hazır • ${page.hostname}`,
      );
    } catch (err) {
      console.error(
        "[Follower Lens] Instagram connection failed:",
        err,
      );

      setLiveStatus(
        "error",
      );

      setLiveMessage(
        err instanceof Error
          ? err.message
          : "Instagram sekmesine bağlanılamadı.",
      );
    }
  }

  async function handleLiveScan() {
    setLiveStatus(
      "scanning",
    );

    setLiveMessage(
      "Takip ettiklerin ve takipçilerin taranıyor. Bu işlem biraz sürebilir.",
    );

    setLiveResult(null);

    setLiveFollowersResult(
      null,
    );

    setFollowerHistory(
      null,
    );

    setQuery("");

    setLiveTab(
      "not-following-back",
    );

    try {
      const result =
        await scanInstagramFollowing();

      const followersResult =
        await scanInstagramFollowers();

      const historyResult =
        await processFollowerHistory(
          result.viewerId,
          followersResult.users,
        );

      console.log(
        "[Follower Lens] following diagnostics:",
        result.diagnostics,
      );

      console.log(
        "[Follower Lens] followers diagnostics:",
        followersResult.diagnostics,
      );

      console.log(
        "[Follower Lens] follower history:",
        historyResult,
      );

      setLiveResult(
        result,
      );

      setLiveFollowersResult(
        followersResult,
      );

      setFollowerHistory(
        historyResult,
      );

      setLiveStatus(
        "ready",
      );

      if (
        historyResult.baselineCreated
      ) {
        setLiveMessage(
          `Analiz tamamlandı • ${result.followingCount} takip edilen • ${followersResult.followerCount} takipçi • Son bırakanlar için ilk kayıt oluşturuldu`,
        );
      } else {
        setLiveMessage(
          `Analiz tamamlandı • ${result.followingCount} takip edilen • ${followersResult.followerCount} takipçi`,
        );
      }
    } catch (err) {
      console.error(
        "[Follower Lens] Live scan failed:",
        err,
      );

      setLiveStatus(
        "error",
      );

      setLiveMessage(
        err instanceof Error
          ? err.message
          : "Instagram taraması başarısız oldu.",
      );
    }
  }

  async function handleFile(
    kind: FileKind,
    file?: File,
  ) {
    if (!file) {
      return;
    }

    setError("");

    setLoadingKind(
      kind,
    );

    try {
      const people =
        await parseInstagramFile(
          file,
        );

      if (
        kind ===
        "followers"
      ) {
        setFollowers(
          people,
        );

        setFollowersName(
          file.name,
        );
      } else {
        setFollowing(
          people,
        );

        setFollowingName(
          file.name,
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Dosya okunamadı.",
      );
    } finally {
      setLoadingKind(
        null,
      );
    }
  }

  function clearFileAnalysis() {
    setFollowers([]);
    setFollowing([]);

    setFollowersName("");
    setFollowingName("");

    setQuery("");
    setError("");
  }

  function clearLiveAnalysis() {
    setLiveResult(null);

    setLiveFollowersResult(
      null,
    );

    setFollowerHistory(
      null,
    );

    setLiveStatus(
      "idle",
    );

    setLiveMessage("");

    setLiveTab(
      "not-following-back",
    );

    setQuery("");
  }

  const counts = {
    "not-following-back":
      analysis
        .notFollowingBack
        .length,

    mutual:
      analysis.mutual
        .length,

    fans:
      analysis.fans
        .length,
  };

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <span />
          </div>

          <div>
            <strong>
              Follower Lens
            </strong>

            <small>
              Private relationship analyzer
            </small>
          </div>
        </div>

        <div className="privacy-pill">
          <Icon name="shield" />
          <span>
            Local only
          </span>
        </div>
      </header>

      {liveAnalysis ? (
        <LiveDashboard
          analysis={
            liveAnalysis
          }
          history={
            followerHistory
          }
          people={
            livePeople
          }
          liveTab={
            liveTab
          }
          query={
            query
          }
          onTabChange={(
            nextTab,
          ) => {
            setLiveTab(
              nextTab,
            );

            setQuery("");
          }}
          onQueryChange={
            setQuery
          }
          onClearQuery={() =>
            setQuery("")
          }
          onReset={
            clearLiveAnalysis
          }
        />
      ) : !fileReady ? (
        <section className="onboarding">
          <div className="hero">
            <div className="eyebrow">
              <Icon name="sparkle" />

              <span>
                PRIVATE • LOCAL • FAST
              </span>
            </div>

            <h1>
              Takip ilişkilerini
              <span>
                {" "}
                temizce gör.
              </span>
            </h1>

            <p>
              Instagram hesabını doğrudan
              Follower Lens ile analiz et.
              JSON yöntemi alternatif olarak
              aşağıda duruyor.
            </p>
          </div>

          <button
            type="button"
            className={`upload-card ${
              liveStatus ===
              "ready"
                ? "loaded"
                : ""
            }`}
            onClick={
              liveStatus ===
              "ready"
                ? handleLiveScan
                : checkInstagramConnection
            }
            disabled={
              liveStatus ===
                "checking" ||
              liveStatus ===
                "scanning"
            }
          >
            <div className="upload-icon">
              <Icon name="sparkle" />
            </div>

            <div className="upload-copy">
              <strong>
                {liveStatus ===
                "checking"
                  ? "Instagram kontrol ediliyor..."
                  : liveStatus ===
                      "scanning"
                    ? "Hesabın taranıyor..."
                    : liveStatus ===
                        "ready"
                      ? "Hesabımı analiz et"
                      : "Instagram'ı bağla"}
              </strong>

              <span>
                {liveStatus ===
                "scanning"
                  ? "Takip ilişkileri kontrol ediliyor..."
                  : liveStatus ===
                      "ready"
                    ? "Live scanner'ı başlat"
                    : "instagram.com açıkken buraya tıkla"}
              </span>
            </div>

            <div className="upload-meta">
              {liveStatus ===
              "ready" ? (
                <b>✓</b>
              ) : liveStatus ===
                "scanning" ? (
                <span>
                  ...
                </span>
              ) : (
                <span>
                  LIVE
                </span>
              )}
            </div>
          </button>

          {liveMessage &&
            (liveStatus ===
              "ready" ||
              liveStatus ===
                "scanning") && (
              <div className="privacy-card">
                <div className="privacy-icon">
                  <Icon name="shield" />
                </div>

                <div>
                  <strong>
                    {liveStatus ===
                    "scanning"
                      ? "Instagram taranıyor."
                      : "Instagram bağlantısı kuruldu."}
                  </strong>

                  <p>
                    {liveMessage}
                  </p>
                </div>
              </div>
            )}

          {liveMessage &&
            (liveStatus ===
              "wrong-tab" ||
              liveStatus ===
                "error") && (
              <div className="error-banner">
                {liveMessage}
              </div>
            )}

          <div
            style={{
              marginTop:
                "18px",

              marginBottom:
                "10px",

              fontSize:
                "10px",

              color:
                "#8f90a0",

              textTransform:
                "uppercase",

              letterSpacing:
                "0.08em",

              fontWeight:
                700,
            }}
          >
            Alternatif • File Mode
          </div>

          <div className="upload-grid">
            <UploadCard
              title="Takipçiler"
              subtitle="followers JSON dosyası"
              filename={
                followersName
              }
              count={
                followers.length
              }
              loading={
                loadingKind ===
                "followers"
              }
              onClick={() =>
                followersInput.current?.click()
              }
              onFile={(
                file,
              ) =>
                handleFile(
                  "followers",
                  file,
                )
              }
            />

            <UploadCard
              title="Takip ettiklerin"
              subtitle="following JSON dosyası"
              filename={
                followingName
              }
              count={
                following.length
              }
              loading={
                loadingKind ===
                "following"
              }
              onClick={() =>
                followingInput.current?.click()
              }
              onFile={(
                file,
              ) =>
                handleFile(
                  "following",
                  file,
                )
              }
            />
          </div>

          <input
            ref={
              followersInput
            }
            className="hidden-input"
            type="file"
            accept=".json,application/json"
            onChange={(
              event,
            ) =>
              handleFile(
                "followers",
                event.target
                  .files?.[0],
              )
            }
          />

          <input
            ref={
              followingInput
            }
            className="hidden-input"
            type="file"
            accept=".json,application/json"
            onChange={(
              event,
            ) =>
              handleFile(
                "following",
                event.target
                  .files?.[0],
              )
            }
          />

          {error && (
            <div className="error-banner">
              {error}
            </div>
          )}

          <div className="privacy-card">
            <div className="privacy-icon">
              <Icon name="shield" />
            </div>

            <div>
              <strong>
                Verilerin cihazında kalır.
              </strong>

              <p>
                Şifre yok, uzak sunucu yok,
                üçüncü taraf analytics yok.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="dashboard">
          <div className="summary-row">
            <StatCard
              label="Takipçi"
              value={
                analysis
                  .followers
                  .length
              }
            />

            <StatCard
              label="Takip edilen"
              value={
                analysis
                  .following
                  .length
              }
            />

            <StatCard
              label="Geri takip etmeyen"
              value={
                analysis
                  .notFollowingBack
                  .length
              }
              accent
            />
          </div>

          <nav
            className="tabs"
            aria-label="Relationship filters"
          >
            {tabConfig.map(
              (item) => (
                <button
                  type="button"
                  key={
                    item.id
                  }
                  className={
                    tab ===
                    item.id
                      ? "tab active"
                      : "tab"
                  }
                  onClick={() => {
                    setTab(
                      item.id,
                    );

                    setQuery(
                      "",
                    );
                  }}
                >
                  <span>
                    {
                      item.short
                    }
                  </span>

                  <b>
                    {
                      counts[
                        item.id
                      ]
                    }
                  </b>
                </button>
              ),
            )}
          </nav>

          <div className="toolbar">
            <SearchBox
              query={
                query
              }
              onChange={
                setQuery
              }
              onClear={() =>
                setQuery("")
              }
            />

            <button
              type="button"
              className="icon-action"
              title="Listeyi TXT olarak indir"
              onClick={() =>
                downloadUsernames(
                  activePeople,
                  `follower-lens-${tab}.txt`,
                )
              }
            >
              <Icon name="download" />
            </button>
          </div>

          <div className="list-head">
            <span>
              {
                activePeople.length
              }{" "}
              hesap
            </span>

            <button
              type="button"
              onClick={
                clearFileAnalysis
              }
            >
              Yeni analiz
            </button>
          </div>

          <div className="people-list">
            {activePeople.length ? (
              activePeople.map(
                (
                  person,
                  index,
                ) => (
                  <article
                    className="person-row"
                    key={
                      person.username
                    }
                  >
                    <div className="avatar">
                      {person.username
                        .slice(
                          0,
                          1,
                        )
                        .toUpperCase()}
                    </div>

                    <div className="person-main">
                      <strong>
                        @
                        {
                          person.username
                        }
                      </strong>

                      <span>
                        {tab ===
                        "not-following-back"
                          ? "Seni geri takip etmiyor"
                          : tab ===
                              "mutual"
                            ? "Karşılıklı takip"
                            : "Seni takip ediyor"}
                      </span>
                    </div>

                    <span className="row-index">
                      {String(
                        index +
                          1,
                      ).padStart(
                        2,
                        "0",
                      )}
                    </span>
                  </article>
                ),
              )
            ) : (
              <EmptyState />
            )}
          </div>

          <Footer />
        </section>
      )}
    </main>
  );
}

function LiveDashboard({
  analysis,
  history,
  people,
  liveTab,
  query,
  onTabChange,
  onQueryChange,
  onClearQuery,
  onReset,
}: {
  analysis: LiveRelationshipAnalysis;
  history: FollowerHistoryUpdate | null;
  people: LiveInstagramUser[];
  liveTab: LiveTab;
  query: string;
  onTabChange: (
    tab: LiveTab,
  ) => void;
  onQueryChange: (
    value: string,
  ) => void;
  onClearQuery: () => void;
  onReset: () => void;
}) {
  const missingFollowing =
    analysis.following
      .diagnostics
      .countDifference &&
    analysis.following
      .diagnostics
      .countDifference >
      0
      ? analysis.following
          .diagnostics
          .countDifference
      : 0;

  return (
    <section className="dashboard">
      <div className="summary-row">
        <StatCard
          label="Takipçi"
          value={
            analysis.followerCount
          }
        />

        <StatCard
          label="Takip edilen"
          value={
            analysis.followingCount
          }
        />

        <StatCard
          label="Geri takip etmeyen"
          value={
            analysis
              .notFollowingBack
              .length
          }
          accent
        />
      </div>

      <div className="live-warning">
        Analiz{" "}
        {
          analysis.followingCount
        }{" "}
        erişilebilir takip edilen ve{" "}
        {
          analysis.followerCount
        }{" "}
        erişilebilir takipçi üzerinden yapıldı.
        {missingFollowing >
          0 && (
          <>
            {" "}
            Instagram takip edilen sayacında ayrıca{" "}
            {
              missingFollowing
            }{" "}
            hesap listelenmedi.
          </>
        )}
      </div>

      {history?.baselineCreated && (
        <div className="live-warning">
          Son bırakanları takip edebilmek için ilk takipçi kaydı oluşturuldu.
          Sonraki analizlerde değişiklikler karşılaştırılacak.
        </div>
      )}

      {!history?.baselineCreated &&
        history &&
        history.pending.length >
          0 && (
          <div className="live-warning">
            {
              history.pending
                .length
            }{" "}
            hesap takipçi listesinde görünmüyor.
            Yanlış sonuçları önlemek için bir sonraki analizde tekrar kontrol
            edilecek.
          </div>
        )}

      <nav
        className="tabs live-tabs"
        aria-label="Live relationship filters"
      >
        <button
          type="button"
          className={
            liveTab ===
            "not-following-back"
              ? "tab active"
              : "tab"
          }
          onClick={() =>
            onTabChange(
              "not-following-back",
            )
          }
        >
          <span>
            Geri Takip Yok
          </span>

          <b>
            {
              analysis
                .notFollowingBack
                .length
            }
          </b>
        </button>

        <button
          type="button"
          className={
            liveTab ===
            "mutual"
              ? "tab active"
              : "tab"
          }
          onClick={() =>
            onTabChange(
              "mutual",
            )
          }
        >
          <span>
            Karşılıklı
          </span>

          <b>
            {
              analysis
                .mutual
                .length
            }
          </b>
        </button>

        <button
          type="button"
          className={
            liveTab ===
            "fans"
              ? "tab active"
              : "tab"
          }
          onClick={() =>
            onTabChange(
              "fans",
            )
          }
        >
          <span>
            Fans
          </span>

          <b>
            {
              analysis
                .fans
                .length
            }
          </b>
        </button>

        <button
          type="button"
          className={
            liveTab ===
            "recent-unfollowers"
              ? "tab active"
              : "tab"
          }
          onClick={() =>
            onTabChange(
              "recent-unfollowers",
            )
          }
        >
          <span>
            Son Bırakanlar
          </span>

          <b>
            {
              history?.recent
                .length ?? 0
            }
          </b>
        </button>
      </nav>

      <div className="toolbar">
        <SearchBox
          query={
            query
          }
          onChange={
            onQueryChange
          }
          onClear={
            onClearQuery
          }
        />

        <button
          type="button"
          className="icon-action"
          title="Listeyi TXT olarak indir"
          onClick={() =>
            downloadUsernames(
              people,
              `follower-lens-live-${liveTab}.txt`,
            )
          }
        >
          <Icon name="download" />
        </button>
      </div>

      <div className="list-head">
        <span>
          {people.length} hesap
        </span>

        <button
          type="button"
          onClick={
            onReset
          }
        >
          Yeni analiz
        </button>
      </div>

      <div className="people-list">
        {people.length ? (
          people.map(
            (
              person,
              index,
            ) => (
              <LivePersonRow
                key={
                  person.id
                }
                person={
                  person
                }
                index={
                  index
                }
                liveTab={
                  liveTab
                }
              />
            ),
          )
        ) : liveTab ===
          "recent-unfollowers" ? (
          <RecentEmptyState
            baselineCreated={
              history?.baselineCreated ??
              false
            }
          />
        ) : (
          <EmptyState />
        )}
      </div>

      <Footer />
    </section>
  );
}

function AvatarImage({
  url,
  username,
}: {
  url: string;
  username: string;
}) {
  const [
    blobUrl,
    setBlobUrl,
  ] = useState("");

  useEffect(() => {
    if (!url) {
      setBlobUrl("");
      return;
    }

    let cancelled = false;
    let objectUrl = "";

    async function loadAvatar() {
      try {
        const cleanUrl =
          url
            .trim()
            .replace(
              /&amp;/g,
              "&",
            );

        const response =
          await fetch(
            cleanUrl,
            {
              credentials:
                "omit",

              cache:
                "force-cache",
            },
          );

        if (!response.ok) {
          throw new Error(
            `Avatar HTTP ${response.status}`,
          );
        }

        const blob =
          await response.blob();

        if (cancelled) {
          return;
        }

        objectUrl =
          URL.createObjectURL(
            blob,
          );

        setBlobUrl(
          objectUrl,
        );
      } catch (error) {
        console.warn(
          "[Follower Lens] Avatar fetch failed:",
          username,
          error,
        );

        if (!cancelled) {
          setBlobUrl("");
        }
      }
    }

    loadAvatar();

    return () => {
      cancelled = true;

      if (objectUrl) {
        URL.revokeObjectURL(
          objectUrl,
        );
      }
    };
  }, [
    url,
    username,
  ]);

  if (!blobUrl) {
    return null;
  }

  return (
    <img
      src={blobUrl}
      alt=""
      loading="lazy"
    />
  );
}

function LivePersonRow({
  person,
  index,
  liveTab,
}: {
  person: LiveInstagramUser;
  index: number;
  liveTab: LiveTab;
}) {
  return (
    <article className="person-row">
      <div className="avatar live-avatar">
        <span>
          {person.username
            .slice(0, 1)
            .toUpperCase()}
        </span>

        {person.profilePicUrl && (
          <AvatarImage
            url={
              person.profilePicUrl
            }
            username={
              person.username
            }
          />
        )}
      </div>

      <div className="person-main">
        <strong>
          @{person.username}
        </strong>

        <span>
          {person.fullName ||
            (liveTab ===
            "not-following-back"
              ? "Seni geri takip etmiyor"
              : liveTab ===
                  "mutual"
                ? "Karşılıklı takip"
                : liveTab ===
                    "fans"
                  ? "Seni takip ediyor"
                  : "Yakın zamanda takipten çıktı")}
        </span>
      </div>

      <a
        className="profile-link"
        href={`https://www.instagram.com/${encodeURIComponent(
          person.username,
        )}/`}
        target="_blank"
        rel="noreferrer"
        title={`@${person.username} profilini aç`}
      >
        Aç ↗
      </a>

      <span className="row-index live-row-index">
        {String(
          index + 1,
        ).padStart(
          2,
          "0",
        )}
      </span>
    </article>
  );
}

function SearchBox({
  query,
  onChange,
  onClear,
}: {
  query: string;
  onChange: (
    value: string,
  ) => void;
  onClear: () => void;
}) {
  return (
    <label className="searchbox">
      <Icon name="search" />

      <input
        value={
          query
        }
        onChange={(
          event,
        ) =>
          onChange(
            event.target
              .value,
          )
        }
        placeholder="Kullanıcı adı ara..."
      />

      {query && (
        <button
          type="button"
          onClick={
            onClear
          }
          aria-label="Aramayı temizle"
        >
          <Icon name="close" />
        </button>
      )}
    </label>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <Icon name="sparkle" />

      <strong>
        Burada kimse yok.
      </strong>

      <span>
        Arama veya seçili kategoride sonuç bulunamadı.
      </span>
    </div>
  );
}

function RecentEmptyState({
  baselineCreated,
}: {
  baselineCreated: boolean;
}) {
  return (
    <div className="empty-state">
      <Icon name="sparkle" />

      <strong>
        {baselineCreated
          ? "İlk kayıt hazır."
          : "Son bırakan bulunmadı."}
      </strong>

      <span>
        {baselineCreated
          ? "Bir sonraki analizden itibaren takipçi değişiklikleri karşılaştırılacak."
          : "Doğrulanmış yakın tarihli takipten çıkan hesap yok."}
      </span>
    </div>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <span className="status-dot" />

      <span>
        Analiz ve takip geçmişi yalnızca cihazında tutuluyor.
      </span>
    </footer>
  );
}

function UploadCard({
  title,
  subtitle,
  filename,
  count,
  loading,
  onClick,
  onFile,
}: {
  title: string;
  subtitle: string;
  filename: string;
  count: number;
  loading: boolean;
  onClick: () => void;
  onFile: (
    file: File,
  ) => void;
}) {
  return (
    <button
      type="button"
      className={`upload-card ${
        filename
          ? "loaded"
          : ""
      }`}
      onClick={
        onClick
      }
      onDragOver={(
        event,
      ) =>
        event.preventDefault()
      }
      onDrop={(
        event,
      ) => {
        event.preventDefault();

        const file =
          event.dataTransfer
            .files[0];

        if (file) {
          onFile(
            file,
          );
        }
      }}
    >
      <div className="upload-icon">
        <Icon name="upload" />
      </div>

      <div className="upload-copy">
        <strong>
          {title}
        </strong>

        <span>
          {loading
            ? "Okunuyor..."
            : filename ||
              subtitle}
        </span>
      </div>

      <div className="upload-meta">
        {filename ? (
          <b>
            {count}
          </b>
        ) : (
          <span>
            JSON
          </span>
        )}
      </div>
    </button>
  );
}

function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={`stat-card ${
        accent
          ? "accent"
          : ""
      }`}
    >
      <span>
        {label}
      </span>

      <strong>
        {value.toLocaleString(
          "tr-TR",
        )}
      </strong>
    </div>
  );
}

export default App;