import type { InstagramPerson } from "../types";

export function downloadUsernames(
  people: InstagramPerson[],
  filename = "follower-lens-export.txt"
) {
  const content = people.map((person) => person.username).join("\n");
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
