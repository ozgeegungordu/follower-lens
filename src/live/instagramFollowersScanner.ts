import { DEFAULT_LIVE_SCAN_CONFIG } from "./rateLimiter";

import type {
  LiveFollowersScanResult,
  LiveInstagramUser,
  LiveScanConfig,
} from "./instagramTypes";

declare const chrome: any;

export async function scanInstagramFollowers(
  config: LiveScanConfig = DEFAULT_LIVE_SCAN_CONFIG,
): Promise<LiveFollowersScanResult> {
  if (
    typeof chrome === "undefined" ||
    !chrome.tabs ||
    !chrome.scripting
  ) {
    throw new Error(
      "Followers scanner yalnızca Chrome extension içinde çalışabilir.",
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
    activeTab.url?.startsWith(
      "https://www.instagram.com/",
    ) ||
    activeTab.url?.startsWith(
      "https://instagram.com/",
    );

  if (!isInstagram) {
    throw new Error(
      "Scanner'ı çalıştırmadan önce Instagram sekmesini aç.",
    );
  }

  const [injection] =
    await chrome.scripting.executeScript({
      target: {
        tabId: activeTab.id,
      },

      world: "MAIN",

      args: [config],

      func: async (
        scanConfig: LiveScanConfig,
      ): Promise<LiveFollowersScanResult> => {
        const IG_APP_ID =
          "936619743392459";

        function sleep(ms: number) {
          return new Promise<void>(
            (resolve) => {
              window.setTimeout(
                resolve,
                Math.max(0, ms),
              );
            },
          );
        }

        function randomBetween(
          min: number,
          max: number,
        ) {
          const low = Math.min(
            min,
            max,
          );

          const high = Math.max(
            min,
            max,
          );

          return Math.floor(
            Math.random() *
              (high - low + 1) +
              low,
          );
        }

        function getCookie(
          name: string,
        ) {
          const escapedName =
            name.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&",
            );

          const match =
            document.cookie.match(
              new RegExp(
                `(?:^|; )${escapedName}=([^;]*)`,
              ),
            );

          return match
            ? decodeURIComponent(
                match[1],
              )
            : null;
        }

        function normalizeUser(
          raw: Record<string, any>,
        ): LiveInstagramUser {
          return {
            id: String(
              raw.pk ??
                raw.id ??
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

            followsViewer: true,
          };
        }

        async function fetchJson(
          url: string,
        ): Promise<any> {
          let attempt = 0;

          while (true) {
            const response =
              await fetch(url, {
                method: "GET",

                credentials:
                  "include",

                headers: {
                  "x-ig-app-id":
                    IG_APP_ID,

                  "x-requested-with":
                    "XMLHttpRequest",
                },
              });

            if (response.ok) {
              const text =
                await response.text();

              try {
                return JSON.parse(
                  text,
                );
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
              if (
                response.status ===
                429
              ) {
                throw new Error(
                  "Instagram followers isteklerini geçici olarak kısıtladı. Bir süre bekleyip tekrar dene.",
                );
              }

              throw new Error(
                `Followers isteği başarısız: HTTP ${response.status}`,
              );
            }

            const waitMs =
              Math.min(
                60000,
                4000 *
                  2 ** attempt,
              );

            await sleep(waitMs);

            attempt += 1;
          }
        }

        const viewerId =
          getCookie("ds_user_id");

        if (!viewerId) {
          throw new Error(
            "Instagram kullanıcı kimliği okunamadı.",
          );
        }

        const collectedUsers:
          LiveInstagramUser[] = [];

        let rawRecords = 0;
        let invalidRecords = 0;
        let page = 0;
        let nextMaxId = "";

        do {
          let endpoint =
            `/api/v1/friendships/` +
            `${viewerId}/followers/` +
            `?count=${scanConfig.pageSize}`;

          if (nextMaxId) {
            endpoint +=
              `&max_id=${encodeURIComponent(
                nextMaxId,
              )}`;
          }

          const json =
            await fetchJson(
              endpoint,
            );

          if (
            !Array.isArray(
              json?.users,
            )
          ) {
            throw new Error(
              "Instagram followers verisi beklenen formatta gelmedi.",
            );
          }

          rawRecords +=
            json.users.length;

          for (
            const rawUser of
            json.users
          ) {
            const user =
              normalizeUser(
                rawUser ?? {},
              );

            if (
              !user.id ||
              !user.username
            ) {
              invalidRecords += 1;
              continue;
            }

            collectedUsers.push(
              user,
            );
          }

          nextMaxId =
            json.next_max_id
              ? String(
                  json.next_max_id,
                )
              : "";

          page += 1;

          if (!nextMaxId) {
            break;
          }

          if (
            page >=
            scanConfig.maxPages
          ) {
            throw new Error(
              "Followers scanner güvenlik amaçlı maksimum sayfa sınırında durduruldu.",
            );
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
        } while (nextMaxId);

        const uniqueById =
          new Map<
            string,
            LiveInstagramUser
          >();

        let duplicateRecords = 0;

        for (
          const user of
          collectedUsers
        ) {
          if (
            uniqueById.has(
              user.id,
            )
          ) {
            duplicateRecords += 1;
            continue;
          }

          uniqueById.set(
            user.id,
            user,
          );
        }

        const uniqueUsers =
          [
            ...uniqueById.values(),
          ];

        return {
          viewerId,

          followerCount:
            uniqueUsers.length,

          users:
            uniqueUsers,

          diagnostics: {
            rawRecords,
            validRecords:
              collectedUsers.length,

            uniqueUsers:
              uniqueUsers.length,

            duplicateRecords,
            invalidRecords,
            pagesFetched: page,
          },
        };
      },
    });

  const result =
    injection?.result as
      | LiveFollowersScanResult
      | undefined;

  if (!result) {
    throw new Error(
      "Followers scanner sonuç döndürmedi.",
    );
  }

  return result;
}