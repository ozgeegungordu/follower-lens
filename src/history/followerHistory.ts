import type { LiveInstagramUser } from "../live/instagramTypes";

declare const chrome: any;

const HISTORY_VERSION = 1;
const MAX_RECENT_UNFOLLOWERS = 100;

export interface StoredFollower {
  id: string;
  username: string;
  fullName: string;
  profilePicUrl: string;
  isVerified: boolean;
  isPrivate: boolean;
}

export interface FollowerSnapshot {
  capturedAt: number;
  users: StoredFollower[];
}

export interface PendingMissingFollower {
  user: StoredFollower;
  firstMissingAt: number;
  missingScans: number;
}

export interface RecentUnfollower {
  user: StoredFollower;
  detectedAt: number;
}

export interface FollowerHistoryState {
  version: 1;
  viewerId: string;
  snapshot: FollowerSnapshot | null;
  pending: PendingMissingFollower[];
  recent: RecentUnfollower[];
}

export interface FollowerHistoryUpdate {
  baselineCreated: boolean;
  confirmedNow: RecentUnfollower[];
  pending: PendingMissingFollower[];
  recent: RecentUnfollower[];
  snapshot: FollowerSnapshot;
}

function getStorageKey(
  viewerId: string,
) {
  return `followerLens:followerHistory:v1:${viewerId}`;
}

function normalizeStoredFollower(
  user: LiveInstagramUser,
): StoredFollower {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    profilePicUrl: user.profilePicUrl,
    isVerified: user.isVerified,
    isPrivate: user.isPrivate,
  };
}

function createSnapshot(
  users: LiveInstagramUser[],
): FollowerSnapshot {
  const uniqueUsers =
    new Map<
      string,
      StoredFollower
    >();

  for (const user of users) {
    if (
      !user.id ||
      !user.username
    ) {
      continue;
    }

    uniqueUsers.set(
      user.id,
      normalizeStoredFollower(
        user,
      ),
    );
  }

  return {
    capturedAt:
      Date.now(),

    users: [
      ...uniqueUsers.values(),
    ],
  };
}

function isHistoryState(
  value: unknown,
  viewerId: string,
): value is FollowerHistoryState {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  const state =
    value as Partial<FollowerHistoryState>;

  return (
    state.version ===
      HISTORY_VERSION &&
    state.viewerId ===
      viewerId &&
    Array.isArray(
      state.pending,
    ) &&
    Array.isArray(
      state.recent,
    )
  );
}

export async function readFollowerHistory(
  viewerId: string,
): Promise<FollowerHistoryState> {
  const emptyState: FollowerHistoryState =
    {
      version:
        HISTORY_VERSION,
      viewerId,
      snapshot: null,
      pending: [],
      recent: [],
    };

  if (
    typeof chrome ===
      "undefined" ||
    !chrome.storage?.local
  ) {
    return emptyState;
  }

  const key =
    getStorageKey(
      viewerId,
    );

  const result =
    await chrome.storage.local.get(
      key,
    );

  const stored =
    result?.[key];

  if (
    !isHistoryState(
      stored,
      viewerId,
    )
  ) {
    return emptyState;
  }

  return stored;
}

async function writeFollowerHistory(
  state: FollowerHistoryState,
): Promise<void> {
  if (
    typeof chrome ===
      "undefined" ||
    !chrome.storage?.local
  ) {
    throw new Error(
      "Follower history yalnızca Chrome extension içinde saklanabilir.",
    );
  }

  const key =
    getStorageKey(
      state.viewerId,
    );

  await chrome.storage.local.set({
    [key]: state,
  });
}

export async function processFollowerHistory(
  viewerId: string,
  currentUsers: LiveInstagramUser[],
): Promise<FollowerHistoryUpdate> {
  const history =
    await readFollowerHistory(
      viewerId,
    );

  const snapshot =
    createSnapshot(
      currentUsers,
    );

  if (!history.snapshot) {
    const initialState: FollowerHistoryState =
      {
        version:
          HISTORY_VERSION,
        viewerId,
        snapshot,
        pending: [],
        recent: [],
      };

    await writeFollowerHistory(
      initialState,
    );

    return {
      baselineCreated: true,
      confirmedNow: [],
      pending: [],
      recent: [],
      snapshot,
    };
  }

  const now =
    Date.now();

  const currentIds =
    new Set(
      snapshot.users.map(
        (user) =>
          user.id,
      ),
    );

  const previousPendingIds =
    new Set(
      history.pending.map(
        (item) =>
          item.user.id,
      ),
    );

  const nextPending =
    new Map<
      string,
      PendingMissingFollower
    >();

  const confirmedNow:
    RecentUnfollower[] = [];

  for (
    const pending of
    history.pending
  ) {
    if (
      currentIds.has(
        pending.user.id,
      )
    ) {
      continue;
    }

    const missingScans =
      pending.missingScans +
      1;

    if (
      missingScans >= 2
    ) {
      confirmedNow.push({
        user:
          pending.user,
        detectedAt: now,
      });

      continue;
    }

    nextPending.set(
      pending.user.id,
      {
        ...pending,
        missingScans,
      },
    );
  }

  for (
    const previousUser of
    history.snapshot.users
  ) {
    if (
      currentIds.has(
        previousUser.id,
      )
    ) {
      continue;
    }

    if (
      previousPendingIds.has(
        previousUser.id,
      )
    ) {
      continue;
    }

    nextPending.set(
      previousUser.id,
      {
        user:
          previousUser,
        firstMissingAt:
          now,
        missingScans: 1,
      },
    );
  }

  const recentById =
    new Map<
      string,
      RecentUnfollower
    >();

  for (
    const item of
    history.recent
  ) {
    recentById.set(
      item.user.id,
      item,
    );
  }

  for (
    const item of
    confirmedNow
  ) {
    recentById.set(
      item.user.id,
      item,
    );
  }

  const recent =
    [
      ...recentById.values(),
    ]
      .sort(
        (a, b) =>
          b.detectedAt -
          a.detectedAt,
      )
      .slice(
        0,
        MAX_RECENT_UNFOLLOWERS,
      );

  const pending =
    [
      ...nextPending.values(),
    ];

  const nextState: FollowerHistoryState =
    {
      version:
        HISTORY_VERSION,
      viewerId,
      snapshot,
      pending,
      recent,
    };

  await writeFollowerHistory(
    nextState,
  );

  return {
    baselineCreated: false,
    confirmedNow,
    pending,
    recent,
    snapshot,
  };
}

export async function clearFollowerHistory(
  viewerId: string,
): Promise<void> {
  if (
    typeof chrome ===
      "undefined" ||
    !chrome.storage?.local
  ) {
    return;
  }

  await chrome.storage.local.remove(
    getStorageKey(
      viewerId,
    ),
  );
}