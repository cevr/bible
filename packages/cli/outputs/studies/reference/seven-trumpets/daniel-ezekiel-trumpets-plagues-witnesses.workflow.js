#!/usr/bin/env bun

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const outputPath = join(
  directory,
  "research-daniel11-12-trumpets-plagues-ezekiel37-39-witnesses.md",
);
const egwPath = join(directory, "gather-ew-michael-stands-up-time.md");

const primaryPassages = [
  "Daniel 11",
  "Daniel 12",
  "Ezekiel 37",
  "Ezekiel 38",
  "Ezekiel 39",
  "Revelation 8",
  "Revelation 9",
  "Revelation 10",
  "Revelation 11",
  "Revelation 15",
  "Revelation 16",
];

const witnessSets = [
  {
    title: "Michael",
    passages: ["Daniel 10:13", "Daniel 10:21", "Daniel 12:1", "Jude 1:9", "Revelation 12:7-12"],
  },
  {
    title: "Time of Trouble",
    passages: ["Daniel 12:1", "Jeremiah 30:4-9", "Matthew 24:21-22", "Revelation 7:13-17"],
  },
  {
    title: "Written in the Book",
    passages: [
      "Exodus 32:31-33",
      "Psalm 69:27-28",
      "Daniel 12:1-3",
      "Malachi 3:16-18",
      "Luke 10:20",
      "Philippians 4:3",
      "Revelation 3:5",
      "Revelation 13:8",
      "Revelation 17:8",
      "Revelation 20:12-15",
      "Revelation 21:27",
    ],
  },
  {
    title: "It Is Done; He That Is Unjust; No Man Was Able to Enter",
    passages: [
      "Daniel 12:9-10",
      "Luke 13:24-28",
      "Revelation 15:5-8",
      "Revelation 16:17-21",
      "Revelation 22:10-12",
    ],
  },
  {
    title: "Wrath and Fury",
    passages: ["Ezekiel 38:18-23", "Revelation 11:15-19", "Revelation 15:1", "Revelation 16:1"],
  },
  {
    title: "Shaking and Earthquake",
    passages: [
      "Ezekiel 38:19-20",
      "Haggai 2:6-7",
      "Haggai 2:21-22",
      "Hebrews 12:25-29",
      "Revelation 11:19",
      "Revelation 16:17-21",
    ],
  },
  {
    title: "Pestilence, Blood, Hailstones, Fire, and Brimstone",
    passages: [
      "Ezekiel 38:21-23",
      "Revelation 8:7-9",
      "Revelation 9:17-21",
      "Revelation 16:3-4",
      "Revelation 16:8-9",
      "Revelation 16:21",
    ],
  },
  {
    title: "Fowls and Supper",
    passages: ["Ezekiel 39:17-20", "Revelation 19:17-21"],
  },
  {
    title: "Graves, Breath, Spirit, and Resurrection",
    passages: [
      "Ezekiel 37:1-14",
      "Daniel 12:1-3",
      "John 5:25-29",
      "Revelation 11:11-12",
      "Revelation 20:4-6",
      "Revelation 20:12-13",
    ],
  },
  {
    title: "Gog and Magog",
    passages: ["Ezekiel 38:1-6", "Ezekiel 39:1-6", "Revelation 20:7-10"],
  },
  {
    title: "Trumpets, Woes, and Plagues",
    passages: [
      "Revelation 8:13",
      "Revelation 9:12",
      "Revelation 11:14-19",
      "Revelation 15:1",
      "Revelation 15:5-8",
      "Revelation 16:1",
      "Revelation 16:12-21",
    ],
  },
];

const lookup = (reference) => {
  const result = Bun.spawnSync(["bible", "verse", reference, "--json"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(`bible verse failed for ${reference}: ${result.stderr.toString()}`);
  }
  const parsed = JSON.parse(result.stdout.toString());
  if (!Array.isArray(parsed.verses) || parsed.verses.length === 0) {
    throw new Error(`No verses found for ${reference}`);
  }
  return parsed.verses;
};

const formatPassage = (reference, headingLevel = 3) => {
  const verses = lookup(reference);
  return [
    `${"#".repeat(headingLevel)} ${reference}`,
    "",
    ...verses.map(
      (verse) =>
        `> **${verse.book_name} ${verse.chapter}:${verse.verse}.** ${verse.text}`,
    ),
    "",
  ].join("\n");
};

const egw = await readFile(egwPath, "utf8");
const egwBody = egw.replace(/^# .*\n+/, "").trim();

const sections = [
  "# Daniel 11–12, the Trumpets, the Plagues, and Ezekiel 37–39",
  "",
  "KJV source dossier.",
  "",
  "The document contains Scripture and Early Writings text.",
  "",
  "The document contains no explanation or conclusion.",
  "",
  "## Primary Passages",
  "",
  ...primaryPassages.map(formatPassage),
  "## Word and Phrase Witnesses",
  "",
  ...witnessSets.flatMap((set) => [
    `### ${set.title}`,
    "",
    ...set.passages.map((reference) => formatPassage(reference, 4)),
  ]),
  "## Early Writings",
  "",
  egwBody,
  "",
  "## Source Receipts",
  "",
  "- KJV database: `/Users/cvr/.bible/bible.db`.",
  "- Ellen G. White database: `/Users/cvr/.bible/egw-paragraphs.db`.",
  "- KJV command: `/Users/cvr/Developer/personal/bible-tools/packages/cli/src/commands/bible.ts`.",
  "- Ellen G. White lookup command: `/Users/cvr/Developer/personal/bible-tools/packages/cli/src/commands/egw/lookup.ts`.",
  "- Ellen G. White book: *Early Writings*.",
  "",
].join("\n");

await writeFile(outputPath, sections, "utf8");
console.log(outputPath);
