import { DEFAULT_LIVE_SCAN_CONFIG } from "./rateLimiter";

import type {
  LiveInstagramUser,
  LiveScanConfig,
  LiveScanDiagnostics,
  LiveScanResult,
} from "./instagramTypes";

declare const chrome: any;

export async function scanInstagramFollowing(
  config: LiveScanConfig = DEFAULT_LIVE_SCAN_CONFIG,
): Promise<LiveScanResult> {
  if (
    typeof chrome === "undefined" ||
    !chrome.tabs ||
    !chrome.scripting
  ) {
    throw new Error(
      "Live scanner yalnızca Chrome extension içinde çalışabilir.",
    );
  }

  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!activeTab?.id) {
    throw new Error("Aktif sekme bulunamadı.");
  }

  const isInstagram =
    activeTab.url?.startsWith("https://www.instagram.com/") ||
    activeTab.url?.startsWith("https://instagram.com/");

  if (!isInstagram) {
    throw new Error(
      "Scanner'ı çalıştırmadan önce Instagram sekmesini aç.",
    );
  }

  const [injection] = await chrome.scripting.executeScript({
    target: {
      tabId: activeTab.id,
    },

    world: "MAIN",

    args: [config],

    func: async (
      scanConfig: LiveScanConfig,
    ): Promise<LiveScanResult> => {
      const IG_APP_ID = "936619743392459";

      const FOLLOWING_QUERY_HASH =
        "3dec7e2c57367ef3da3d987d89f9dbc8";

      function sleep(ms: number) {
        return new Promise<void>((resolve) => {
          window.setTimeout(
            resolve,
            Math.max(0, ms),
          );
        });
      }

      function randomBetween(
        min: number,
        max: number,
      ) {
        const low = Math.min(min, max);
        const high = Math.max(min, max);

        return Math.floor(
          Math.random() * (high - low + 1) + low,
        );
      }

      function getCookie(name: string) {
        const escapedName = name.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        );

        const match = document.cookie.match(
          new RegExp(
            `(?:^|; )${escapedName}=([^;]*)`,
          ),
        );

        return match
          ? decodeURIComponent(match[1])
          : null;
      }

      function readFollowsViewer(
        raw: Record<string, any>,
      ): boolean | null {
        if (
          typeof raw.follows_viewer === "boolean"
        ) {
          return raw.follows_viewer;
        }

        if (
          typeof raw.friendship_status?.followed_by ===
          "boolean"
        ) {
          return raw.friendship_status.followed_by;
        }

        if (
          typeof raw.followed_by === "boolean"
        ) {
          return raw.followed_by;
        }

        return null;
      }

      function normalizeUser(
        raw: Record<string, any>,
      ): LiveInstagramUser {
        return {
          id: String(
            raw.id ??
              raw.pk ??
              raw.pk_id ??
              "",
          ),

          username: String(
            raw.username ?? "",
          ),

          fullName: String(
            raw.full_name ?? "",
          ),

          profilePicUrl: String(
            raw.profile_pic_url ??
              raw.profile_pic_url_hd ??
              "",
          ),

          isVerified: Boolean(
            raw.is_verified,
          ),

          isPrivate: Boolean(
            raw.is_private,
          ),

          followsViewer:
            readFollowsViewer(raw),
        };
      }

      async function fetchJson(
        url: string,
      ): Promise<any> {
        let attempt = 0;

        while (true) {
          const response = await fetch(url, {
            method: "GET",

            credentials: "include",

            headers: {
              "x-ig-app-id": IG_APP_ID,
              "x-requested-with":
                "XMLHttpRequest",
            },
          });

          if (response.ok) {
            const text =
              await response.text();

            try {
              return JSON.parse(text);
            } catch {
              throw new Error(
                "Instagram beklenmeyen bir yanıt döndürdü.",
              );
            }
          }

          const retryable =
            response.status === 429 ||
            response.status >= 500;

          if (
            !retryable ||
            attempt >=
              scanConfig.maxRetries
          ) {
            if (response.status === 429) {
              throw new Error(
                "Instagram istekleri geçici olarak kısıtladı. Bir süre bekleyip tekrar dene.",
              );
            }

            throw new Error(
              `Instagram isteği başarısız: HTTP ${response.status}`,
            );
          }

          const waitMs = Math.min(
            60000,
            4000 * 2 ** attempt,
          );

          await sleep(waitMs);

          attempt += 1;
        }
      }

      const viewerId =
        getCookie("ds_user_id");

      if (!viewerId) {
        throw new Error(
          "Instagram kullanıcı kimliği okunamadı. Instagram'da giriş yaptığından emin ol.",
        );
      }

      const collectedUsers: LiveInstagramUser[] =
        [];

      const reportedCounts = new Set<number>();

      let rawRecords = 0;
      let invalidRecords = 0;
      let page = 0;
      let cursor = "";
      let hasNextPage = true;

      while (
        hasNextPage &&
        page < scanConfig.maxPages
      ) {
        const variables: Record<
          string,
          unknown
        > = {
          id: viewerId,
          include_reel: true,
          fetch_mutual: false,
          first: scanConfig.pageSize,
        };

        if (cursor) {
          variables.after = cursor;
        }

        const endpoint =
          `/graphql/query/` +
          `?query_hash=${FOLLOWING_QUERY_HASH}` +
          `&variables=${encodeURIComponent(
            JSON.stringify(variables),
          )}`;

        const json =
          await fetchJson(endpoint);

        const edge =
          json?.data?.user?.edge_follow;

        if (!edge?.edges) {
          throw new Error(
            "Instagram following verisi beklenen formatta gelmedi.",
          );
        }

        if (
          typeof edge.count === "number"
        ) {
          reportedCounts.add(edge.count);
        }

        rawRecords += edge.edges.length;

        for (const item of edge.edges) {
          const user = normalizeUser(
            item?.node ?? {},
          );

          if (
            !user.id ||
            !user.username
          ) {
            invalidRecords += 1;
            continue;
          }

          collectedUsers.push(user);
        }

        cursor =
          edge.page_info?.end_cursor ??
          "";

        hasNextPage = Boolean(
          edge.page_info
            ?.has_next_page &&
            cursor,
        );

        page += 1;

        if (!hasNextPage) {
          break;
        }

        await sleep(
          randomBetween(
            scanConfig.delayMinMs,
            scanConfig.delayMaxMs,
          ),
        );

        if (
          scanConfig.pauseEveryPages >
            0 &&
          page %
            scanConfig.pauseEveryPages ===
            0
        ) {
          await sleep(
            scanConfig.pauseMs,
          );
        }
      }

      if (
        hasNextPage &&
        page >= scanConfig.maxPages
      ) {
        throw new Error(
          "Scanner güvenlik amaçlı maksimum sayfa sınırında durduruldu.",
        );
      }

      const uniqueById =
        new Map<
          string,
          LiveInstagramUser
        >();

      let duplicateRecords = 0;

      for (const user of collectedUsers) {
        if (uniqueById.has(user.id)) {
          duplicateRecords += 1;
          continue;
        }

        uniqueById.set(
          user.id,
          user,
        );
      }

      const uniqueUsers =
        [...uniqueById.values()];

      const mutualCount =
        uniqueUsers.filter(
          (user) =>
            user.followsViewer === true,
        ).length;

      const notFollowingBackCount =
        uniqueUsers.filter(
          (user) =>
            user.followsViewer === false,
        ).length;

      const unknownRelationshipCount =
        uniqueUsers.filter(
          (user) =>
            user.followsViewer === null,
        ).length;

      const allReportedCounts =
        [...reportedCounts];

      const reportedCount =
        allReportedCounts.length
          ? allReportedCounts[0]
          : null;

      const countDifference =
        reportedCount === null
          ? null
          : reportedCount -
            uniqueUsers.length;

      const diagnostics: LiveScanDiagnostics =
        {
          reportedCount,
          reportedCounts:
            allReportedCounts,

          rawRecords,
          validRecords:
            collectedUsers.length,
          uniqueUsers:
            uniqueUsers.length,

          duplicateRecords,
          invalidRecords,

          pagesFetched: page,

          unknownRelationshipCount,

          countDifference,

          isComplete:
            reportedCount === null
              ? true
              : uniqueUsers.length ===
                reportedCount,
        };

      console.table({
        reportedCount:
          diagnostics.reportedCount,

        rawRecords:
          diagnostics.rawRecords,

        validRecords:
          diagnostics.validRecords,

        uniqueUsers:
          diagnostics.uniqueUsers,

        duplicateRecords:
          diagnostics.duplicateRecords,

        invalidRecords:
          diagnostics.invalidRecords,

        pagesFetched:
          diagnostics.pagesFetched,

        unknownRelationships:
          diagnostics.unknownRelationshipCount,

        countDifference:
          diagnostics.countDifference,

        isComplete:
          diagnostics.isComplete,
      });

      return {
        viewerId,

        followingCount:
          uniqueUsers.length,

        mutualCount,

        notFollowingBackCount,

        unknownRelationshipCount,

        users: uniqueUsers,

        diagnostics,
      };
    },
  });

  const result =
    injection?.result as
      | LiveScanResult
      | undefined;

  if (!result) {
    throw new Error(
      "Instagram scanner sonuç döndürmedi.",
    );
  }

  return result;
}