function ownerName(owner) {
  if (typeof owner === "string") return owner.trim();
  return String(owner?.username || owner?.name || "").trim();
}

export function formatBeatmapOwners(beatmap) {
  const owners = Array.isArray(beatmap?.owners) ? [...new Set(beatmap.owners.map(ownerName).filter(Boolean))] : [];
  if (owners.length === 1) return owners[0];
  if (owners.length === 2) return `${owners[0]} and ${owners[1]}`;
  if (owners.length > 2) return `${owners.slice(0, -1).join(", ")} and ${owners.at(-1)}`;

  return ownerName(beatmap?.creator || beatmap?.beatmapset?.creator);
}
