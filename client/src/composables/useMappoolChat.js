const PARSER_VERSION = "1";

const PHASE_PATTERNS = [
  { phase: "opening-ban", pattern: /\b(?:first|next)\s+bans?\b|\b(?:your|the)\s+ban\b|\bban(?:ning)?\s+phase\b|\bstart(?:ing)?\s+bans?\b/i },
  { phase: "opening-protect", pattern: /\b(?:first|next)\s+(?:protect(?:ion)?s?)\b|\b(?:your|the)\s+protect\b|\bprotect(?:ing)?\s+phase\b|\bstart(?:ing)?\s+protects?\b/i },
  { phase: "pick", pattern: /\b(?:first|next)\s+picks?\b|\b(?:your|the)\s+pick\b|\bpick(?:ing)?\s+phase\b|\bstart(?:ing)?\s+picks?\b/i },
  {
    phase: "opening-ban",
    pattern:
      /(?<![\p{L}\p{N}_])(?:ваш|ваша|ваши|твой|твоя|твои)\s+бан(?:а|ы|ить|ь)?(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_])фаз(?:а|у|е)?\s+бан(?:ов|ы|ить|ь)?(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_])(?:начинаем|начинается|начинайте|давай|давайте)\s+бан(?:ы|ить|им|ьте|ь|ай)?(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_])переходим\s+к\s+бан(?:ам|у|ить|ь)?(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_])время\s+банить(?![\p{L}\p{N}_])/iu,
  },
  {
    phase: "opening-protect",
    pattern:
      /(?<![\p{L}\p{N}_])(?:ваш|ваша|ваши|твой|твоя|твои)\s+протект(?:а|ы|ить|и)?(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_])фаз(?:а|у|е)?\s+протект(?:ов|ы|ить|и)?(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_])(?:начинаем|начинается|начинайте|давай|давайте)\s+протект(?:ы|ить|им|ьте|и)?(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_])переходим\s+к\s+протект(?:ам|у|ить|и)?(?![\p{L}\p{N}_])/iu,
  },
  {
    phase: "pick",
    pattern:
      /(?<![\p{L}\p{N}_])(?:ваш|ваша|ваши|твой|твоя|твои)\s+пик(?:а|и|нуть|ать|ай)?(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_])фаз(?:а|у|е)?\s+пик(?:ов|и|ать|ай)?(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_])(?:начинаем|начинается|начинайте|давай|давайте)\s+пик(?:и|нуть|ать|аем|аемся|нем|ни|ните|нул|нули|ай|айте)?(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_])переходим\s+к\s+пик(?:ам|у|нуть|ать|ай)?(?![\p{L}\p{N}_])/iu,
  },
];

const ACTION_PRIORITY = { protect: 3, ban: 2, pick: 1 };
const GROUP_SEPARATOR = /^(?:[\s,.;/&+\-]|\band\b|(?<![\p{L}\p{N}_])и(?![\p{L}\p{N}_]))+$/iu;

const ACTION_PATTERNS = [
  {
    action: "ban",
    pattern:
      /(?<![\p{L}\p{N}_])(?:забань|забанить|забаним|забанил|забанили|забанен|забанена|забанено|забаньте|забаню|забанишь|баним|банить|банят|баньте|баню|банишь|бан|баны|бань|запрети|запретить|запрещаем|запрещена|убери|убрать|убираем|удали|удалить|удаляем|вычеркни|вычеркнуть|вычёркиваем|выбросить|исключи|исключить|заблочить|заблокировать)(?![\p{L}\p{N}_])/giu,
  },
  {
    action: "protect",
    pattern:
      /(?<![\p{L}\p{N}_])(?:защити|защитить|защищать|защищаем|защищаемся|защищай|защищайте|защищена|защищен|защищено|защищены|протекти|протектить|протектнуть|протект|протекты|протектим|протектнем|протекти|протекнем|протек|протекти|протэк|сейв|сейвить|сейвни|сейвь|сейвьте|сейвануть|сохрани|сохранить|сохраняем|сохраним|оставь|оставить|оставляем|оставим|закрепи|закрепить|застолбить|не трогай|не трогать)(?![\p{L}\p{N}_])/giu,
  },
  {
    action: "pick",
    pattern:
      /(?<![\p{L}\p{N}_])(?:пикни|пикните|пикнуть|пикать|пикай|пикайте|пикнул|пикнула|пикнули|пикнем|пикаем|пикануть|пик|пики|выбери|выберите|выбирать|выбирай|выбирайте|выбран|выбрали|выберем|играть|играй|играйте|сыграть|сыграем|играем|берем|берём|берите|берете|возьмем|возьмём|возьми|возьмите|взять|забери|забрать|забираем|ставим|ставь)(?![\p{L}\p{N}_])/giu,
  },
  { action: "ban", pattern: /(?<![\p{L}\p{N}_])(?:убери|удали|вычеркни)\s+(?=\S)(?![\p{L}\p{N}_])/giu },
  { action: "protect", pattern: /(?<![\p{L}\p{N}_])(?:оставь|сохрани|защити)\s+(?=\S)(?![\p{L}\p{N}_])/giu },
  { action: "pick", pattern: /(?<![\p{L}\p{N}_])(?:давай\s+сыграем|давайте\s+сыграем|давай\s+пикнем|давайте\s+пикнем)\b/giu },
  { action: "ban", pattern: /\bget\s+rid\s+of\b/giu },
  { action: "ban", pattern: /\btake\b[^.!?;:]*?\bout\b/giu },
  { action: "protect", pattern: /\bkeep\s+safe\b/giu },
  { action: "pick", pattern: /\block\s+in\b/giu },
  {
    action: "ban",
    pattern:
      /\b(?:ban|bans|banned|banning|veto|vetoes|vetoed|vetoing|strike|strikes|struck|striking|remove|removes|removed|removing|eliminate|eliminates|eliminated|eliminating|delete|deletes|deleted|deleting)\b/giu,
  },
  {
    action: "protect",
    pattern:
      /\b(?:protect|protects|protected|protecting|save|saves|saved|saving|shield|shields|shielded|shielding|defend|defends|defended|defending|reserve|reserves|reserved|reserving|keep|keeps|kept|keeping|leave|leaves|left|leaving|lock|locks|locked|locking)\b/giu,
  },
  {
    action: "pick",
    pattern:
      /\b(?:pick|picks|picked|picking|choose|chooses|chose|chosen|choosing|select|selects|selected|selecting|play|plays|played|playing|take|takes|took|taken|taking|call|calls|called|calling|nominate|nominates|nominated|nominating)\b/giu,
  },
];

const RUSSIAN_CATEGORY_ALIASES = {
  NM: ["НМ"],
  FM: ["ФМ"],
  HD: ["ХД"],
  HR: ["ХР"],
  DT: ["ДТ"],
  TB: ["ТБ"],
  EZ: ["ЕЗ"],
  FL: ["ФЛ"],
  HT: ["ХТ"],
  NC: ["НС"],
  FI: ["ФИ"],
  SD: ["СД"],
  SV: ["СВ"],
  DS: ["ДС"],
};

const LATIN_TO_CYRILLIC = {
  A: "А",
  B: "Б",
  C: "К",
  D: "Д",
  E: "Е",
  F: "Ф",
  G: "Г",
  H: "Х",
  I: "И",
  J: "Ж",
  K: "К",
  L: "Л",
  M: "М",
  N: "Н",
  O: "О",
  P: "П",
  Q: "К",
  R: "Р",
  S: "С",
  T: "Т",
  U: "У",
  V: "В",
  W: "В",
  X: "КС",
  Y: "Й",
  Z: "З",
};

const CYRILLIC_TO_LATIN = {
  А: "A",
  Б: "B",
  В: "V",
  Г: "G",
  Д: "D",
  Е: "E",
  Ж: "ZH",
  З: "Z",
  И: "I",
  Й: "Y",
  К: "K",
  Л: "L",
  М: "M",
  Н: "N",
  О: "O",
  П: "P",
  Р: "R",
  С: "S",
  Т: "T",
  У: "U",
  Ф: "F",
  Х: "H",
  Ц: "C",
  Ч: "CH",
  Ш: "SH",
  Щ: "SCH",
  Ъ: "",
  Ы: "Y",
  Ь: "",
  Э: "E",
  Ю: "YU",
  Я: "YA",
};

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function russianCategoryAlias(category) {
  return String(category || "")
    .toUpperCase()
    .split("")
    .map((letter) => LATIN_TO_CYRILLIC[letter] || letter)
    .join("");
}

function latinCategoryAlias(category) {
  return String(category || "")
    .toUpperCase()
    .split("")
    .map((letter) => CYRILLIC_TO_LATIN[letter] || letter)
    .join("");
}

function slotAliases(slotId) {
  const value = String(slotId || "").trim();
  const match = value.match(/^(.*?)(\d+)$/);
  if (!match) return [];
  const category = match[1];
  const number = match[2];
  return [...new Set([category, ...(RUSSIAN_CATEGORY_ALIASES[category.toUpperCase()] || []), russianCategoryAlias(category), latinCategoryAlias(category)].filter(Boolean))].map(
    (alias) => `${alias}${number}`,
  );
}

function slotPattern(slotId) {
  const value = String(slotId || "").trim();
  const match = value.match(/^(.*?)(\d+)$/);
  if (!match) return null;
  const aliases = slotAliases(value);
  return {
    slotId: value,
    pattern: new RegExp(
      `(^|[^\\p{L}\\p{N}_])(${aliases
        .map((alias) => {
          const aliasMatch = alias.match(/^(.*?)(\d+)$/);
          return `${escapeRegExp(aliasMatch[1])}[\\s-]*${aliasMatch[2]}`;
        })
        .join("|")})(?=$|[^\\p{L}\\p{N}_])`,
      "giu",
    ),
  };
}

function findSlots(text, slots) {
  const source = String(text || "");
  const found = [];
  const candidates = [...new Set((slots || []).map((slot) => (typeof slot === "string" ? slot : slot?.slotId)).filter(Boolean))]
    .map(slotPattern)
    .filter(Boolean)
    .sort((left, right) => right.slotId.length - left.slotId.length);

  for (const candidate of candidates) {
    for (const match of source.matchAll(candidate.pattern)) {
      const raw = match[2];
      const start = (match.index || 0) + (match[1]?.length || 0);
      const end = start + raw.length;
      if (found.some((item) => start < item.end && end > item.start)) continue;
      found.push({ slotId: candidate.slotId, start, end, text: raw });
    }
  }

  return found.sort((left, right) => left.start - right.start);
}

function buildGroups(source, occurrences) {
  const groups = [];
  for (const occurrence of occurrences) {
    const previous = groups.at(-1);
    if (previous && GROUP_SEPARATOR.test(source.slice(previous.occurrences.at(-1).end, occurrence.start))) {
      previous.occurrences.push(occurrence);
    } else {
      groups.push({ occurrences: [occurrence] });
    }
  }
  return groups.map((group) => ({
    ...group,
    start: group.occurrences[0].start,
    end: group.occurrences.at(-1).end,
  }));
}

function getClauseBounds(source, group, groups) {
  const protectedRanges = groups.map((item) => [item.start, item.end]);
  const isProtected = (index) => protectedRanges.some(([start, end]) => index >= start && index < end);
  const breaks = [];
  const groupHasRange = (start, end) => groups.some((item) => item.start <= start && item.end >= end);
  for (const match of source.matchAll(/\b(?:but|then)\b|[,.!?;:]/giu)) {
    const start = match.index || 0;
    const end = start + match[0].length;
    const betweenSlots = groups.some((item) =>
      item.occurrences.some((left, index) => {
        const right = item.occurrences[index + 1];
        return right && left.end <= start && end <= right.start;
      }),
    );
    if (!isProtected(start) && !betweenSlots && !groupHasRange(start, end)) breaks.push({ start, end });
  }
  let start = 0;
  let end = source.length;
  for (const boundary of breaks) {
    if (boundary.end <= group.start) start = boundary.end;
    if (boundary.start >= group.end) {
      end = boundary.start;
      break;
    }
  }
  return { start, end };
}

function collectActionCandidates(source, start, end, group) {
  const clause = source.slice(start, end);
  const candidates = [];
  for (let patternIndex = 0; patternIndex < ACTION_PATTERNS.length; patternIndex += 1) {
    const definition = ACTION_PATTERNS[patternIndex];
    for (const match of clause.matchAll(definition.pattern)) {
      const localStart = match.index || 0;
      const localEnd = localStart + match[0].length;
      const absoluteStart = start + localStart;
      const absoluteEnd = start + localEnd;
      const containsGroup = absoluteStart < group.end && absoluteEnd > group.start;
      const distance = containsGroup ? 0 : absoluteEnd <= group.start ? group.start - absoluteEnd : absoluteStart - group.end;
      const leftOfGroup = absoluteEnd <= group.start;
      candidates.push({
        action: definition.action,
        start: absoluteStart,
        end: absoluteEnd,
        distance,
        leftOfGroup,
        length: match[0].length,
        patternIndex,
      });
    }
  }
  return candidates;
}

function compareCandidates(left, right) {
  if (right.length !== left.length) return right.length - left.length;
  if (left.distance !== right.distance) return left.distance - right.distance;
  if (left.leftOfGroup !== right.leftOfGroup) return left.leftOfGroup ? -1 : 1;
  return (ACTION_PRIORITY[right.action] || 0) - (ACTION_PRIORITY[left.action] || 0);
}

function phaseFromText(text) {
  const normalized = String(text || "")
    .trim()
    .toLocaleLowerCase("ru");
  if (/^(?:ban|bans|banning|бан|баны|банить|баним|баньте|бань|баню|забань|забаньте|забанить)$/.test(normalized)) return "opening-ban";
  if (/^(?:protect|protecting|protects|протект|протекты|протектить|протектим|протектнем|протекти|протекти|протектните|защити|защитите|сейв|сейвить|сейвни|сейвите)$/.test(normalized))
    return "opening-protect";
  if (/^(?:pick|picks|picking|пик|пики|пикнуть|пикнем|пикаем|пикать|пикай|пикайте|пикни|пикните|выбери|выберите)$/.test(normalized)) return "pick";
  for (const item of PHASE_PATTERNS) {
    if (item.pattern.test(String(text || ""))) return item.phase;
    item.pattern.lastIndex = 0;
  }
  return null;
}

export function createMappoolChatContext() {
  return {
    phase: "unknown",
    phaseAtMessage: new Map(),
  };
}

export function advanceMappoolChatContext(context, message, { roomClosed = false } = {}) {
  if (roomClosed || context.phase === "finished") {
    context.phase = "finished";
  } else {
    const nextPhase = phaseFromText(message?.text);
    if (nextPhase) context.phase = nextPhase;
  }
  const messageId = message?.id;
  if (messageId !== undefined && messageId !== null) context.phaseAtMessage.set(messageId, context.phase);
  return context.phase;
}

export function parseMappoolMessage(text, slots, phaseAtMessage = "unknown") {
  if (phaseAtMessage === "finished") return { slots: [], groups: [] };
  const source = String(text || "");
  const occurrences = findSlots(source, slots);
  const groups = buildGroups(source, occurrences);
  const usedCandidates = new Set();
  const parsedGroups = groups.map((group) => {
    const bounds = getClauseBounds(source, group, groups);
    const candidates = collectActionCandidates(source, bounds.start, bounds.end, group)
      .filter((candidate) => !usedCandidates.has(`${candidate.start}:${candidate.end}:${candidate.action}`))
      .sort(compareCandidates);
    const selected = candidates[0] || null;
    if (selected) usedCandidates.add(`${selected.start}:${selected.end}:${selected.action}`);
    const action = selected?.action || (phaseAtMessage === "opening-ban" ? "ban" : phaseAtMessage === "opening-protect" ? "protect" : "pick");
    return { ...group, action, candidates, selectedCandidate: selected };
  });
  return {
    groups: parsedGroups,
    slots: parsedGroups.flatMap((group) =>
      group.occurrences.map((slot) => ({
        ...slot,
        action: group.action,
        groupStart: group.start,
        groupEnd: group.end,
      })),
    ),
  };
}

export function mappoolParserCacheKey(text, slotSetVersion, phaseAtMessage) {
  return `${PARSER_VERSION}\u0000${slotSetVersion}\u0000${phaseAtMessage}\u0000${String(text || "")}`;
}

export { PARSER_VERSION, phaseFromText };
