import type {
  LiveFollowersScanResult,
  LiveInstagramUser,
  LiveScanResult,
} from "./instagramTypes";

export interface LiveRelationshipAnalysis {
  following: LiveScanResult;
  followers: LiveFollowersScanResult;
  followingCount: number;
  followerCount: number;
  mutual: LiveInstagramUser[];
  notFollowingBack: LiveInstagramUser[];
  fans: LiveInstagramUser[];
}

export function analyzeLiveRelationships(
  following: LiveScanResult,
  followers: LiveFollowersScanResult,
): LiveRelationshipAnalysis {
  const followingIds = new Set(
    following.users.map((user) => user.id),
  );

  const followerIds = new Set(
    followers.users.map((user) => user.id),
  );

  const mutual = following.users.filter((user) =>
    followerIds.has(user.id),
  );

  const notFollowingBack = following.users.filter(
    (user) => !followerIds.has(user.id),
  );

  const fans = followers.users.filter(
    (user) => !followingIds.has(user.id),
  );

  return {
    following,
    followers,
    followingCount: following.users.length,
    followerCount: followers.users.length,
    mutual,
    notFollowingBack,
    fans,
  };
}