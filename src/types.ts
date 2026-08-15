export type RelationshipTab = "not-following-back" | "mutual" | "fans";

export interface InstagramPerson {
  username: string;
  href?: string;
  timestamp?: number;
}

export interface AnalysisResult {
  followers: InstagramPerson[];
  following: InstagramPerson[];
  notFollowingBack: InstagramPerson[];
  mutual: InstagramPerson[];
  fans: InstagramPerson[];
}
