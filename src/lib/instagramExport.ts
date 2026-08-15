import type { AnalysisResult, InstagramPerson } from "../types";

type UnknownRecord = Record<string, unknown>;

const normalize = (value: string) => value.trim().replace(/^@/, "").toLowerCase();

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pushPerson(
  target: Map<string, InstagramPerson>,
  username: unknown,
  href?: unknown,
  timestamp?: unknown
) {
  if (typeof username !== "string") return;
  const clean = username.trim().replace(/^@/, "");
  if (!clean || clean.includes(" ")) return;

  const key = normalize(clean);
  if (!target.has(key)) {
    target.set(key, {
      username: clean,
      href: typeof href === "string" ? href : undefined,
      timestamp: typeof timestamp === "number" ? timestamp : undefined
    });
  }
}

/**
 * Handles the common Meta/Instagram export structure:
 * { string_list_data: [{ href, value, timestamp }] }
 * and also tolerates simple objects/arrays containing username/value fields.
 */
export function parseInstagramPeople(input: unknown): InstagramPerson[] {
  const found = new Map<string, InstagramPerson>();
  const seen = new Set<unknown>();

  function walk(node: unknown) {
    if (node === null || node === undefined || seen.has(node)) return;

    if (typeof node === "string") {
      return;
    }

    if (Array.isArray(node)) {
      seen.add(node);
      node.forEach(walk);
      return;
    }

    if (!isRecord(node)) return;
    seen.add(node);

    const stringList = node.string_list_data;
    if (Array.isArray(stringList)) {
      for (const item of stringList) {
        if (!isRecord(item)) continue;
        pushPerson(found, item.value, item.href, item.timestamp);
      }
    }

    if (typeof node.username === "string") {
      pushPerson(found, node.username, node.href, node.timestamp);
    }

    // Some exports expose a relationship item as { value: "username", href: "..." }.
    if (
      typeof node.value === "string" &&
      (typeof node.href === "string" || typeof node.timestamp === "number")
    ) {
      pushPerson(found, node.value, node.href, node.timestamp);
    }

    Object.values(node).forEach(walk);
  }

  walk(input);
  return [...found.values()].sort((a, b) =>
    a.username.localeCompare(b.username, undefined, { sensitivity: "base" })
  );
}

export async function parseInstagramFile(file: File): Promise<InstagramPerson[]> {
  const text = await file.text();

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${file.name} geçerli bir JSON dosyası değil.`);
  }

  const people = parseInstagramPeople(json);
  if (!people.length) {
    throw new Error(
      `${file.name} içinde kullanıcı adı bulunamadı. Instagram/Meta JSON export dosyasını seçtiğinden emin ol.`
    );
  }

  return people;
}

export function analyzeRelationships(
  followers: InstagramPerson[],
  following: InstagramPerson[]
): AnalysisResult {
  const followersMap = new Map(followers.map((person) => [normalize(person.username), person]));
  const followingMap = new Map(following.map((person) => [normalize(person.username), person]));

  const notFollowingBack = following.filter(
    (person) => !followersMap.has(normalize(person.username))
  );

  const mutual = following.filter((person) =>
    followersMap.has(normalize(person.username))
  );

  const fans = followers.filter(
    (person) => !followingMap.has(normalize(person.username))
  );

  return {
    followers,
    following,
    notFollowingBack,
    mutual,
    fans
  };
}
