export function formatHistoryDate(
  timestamp: number,
): string {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(
    new Date(timestamp),
  );
}

export function formatRelativeHistoryDate(
  timestamp: number,
): string {
  const difference =
    Date.now() - timestamp;

  const minute =
    60 * 1000;

  const hour =
    60 * minute;

  const day =
    24 * hour;

  if (difference < minute) {
    return "Just now";
  }

  if (difference < hour) {
    const minutes =
      Math.floor(
        difference / minute,
      );

    return `${minutes}m ago`;
  }

  if (difference < day) {
    const hours =
      Math.floor(
        difference / hour,
      );

    return `${hours}h ago`;
  }

  const days =
    Math.floor(
      difference / day,
    );

  if (days === 1) {
    return "Yesterday";
  }

  if (days < 7) {
    return `${days}d ago`;
  }

  return formatHistoryDate(
    timestamp,
  );
}
