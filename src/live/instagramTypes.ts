export interface LiveInstagramUser {
  id: string;
  username: string;
  fullName: string;
  profilePicUrl: string;
  isVerified: boolean;
  isPrivate: boolean;
  followsViewer: boolean | null;
}

export interface LiveScanConfig {
  pageSize: number;
  delayMinMs: number;
  delayMaxMs: number;
  pauseEveryPages: number;
  pauseMs: number;
  maxRetries: number;
  maxPages: number;
}

export interface LiveScanDiagnostics {
  reportedCount: number | null;
  reportedCounts: number[];
  rawRecords: number;
  validRecords: number;
  uniqueUsers: number;
  duplicateRecords: number;
  invalidRecords: number;
  pagesFetched: number;
  unknownRelationshipCount: number;
  countDifference: number | null;
  isComplete: boolean;
}

export interface LiveScanResult {
  viewerId: string;
  followingCount: number;
  mutualCount: number;
  notFollowingBackCount: number;
  unknownRelationshipCount: number;
  users: LiveInstagramUser[];
  diagnostics: LiveScanDiagnostics;
}

export interface LiveFollowersScanDiagnostics {
  rawRecords: number;
  validRecords: number;
  uniqueUsers: number;
  duplicateRecords: number;
  invalidRecords: number;
  pagesFetched: number;
}

export interface LiveFollowersScanResult {
  viewerId: string;
  followerCount: number;
  users: LiveInstagramUser[];
  diagnostics: LiveFollowersScanDiagnostics;
}