# The lab as an MCP server — 2026-10-14

The owner (2026-10-14): "lets also make the lab an mcp server, so these things can easily go back and forth, you can
read, receive events". Before this, an agent handed work over by publishing a set by hand and messaging links, and
learned of the owner's notes, picks and approvals only when someone told it. Now the lab is the channel both ways:
an agent reads what the owner said, answers in the lab, hands work over as a set, and hears the next thing the owner
does, while the lab runs.

## Transport

- **Streamable HTTP at `/mcp` on the lab's own port** (`http://127.0.0.1:8229/mcp`), served by Effect's
  `McpServer.layerHttp` (effect 4.0.2, `effect/ai`) on the lab's router, beside the page and the API. The lab
  already holds every store; a second process would be a second writer. Protocols `2025-11-25`, `2025-06-18`,
  `2025-03-26` and `2026-07-28`.
- Effect's HTTP transport takes a `POST` for every message, and here a `DELETE` to end a session (below); it
  has no standalone GET stream, so the server cannot push a notification outside a request, and it advertises
  no resource subscriptions over HTTP. Events therefore come three ways (see [Events](#events)): a long-poll tool
  every session can use, a stdio bridge for Claude Code's channels, and a command that exits once an ask is
  answered.
- **One client** of it in this checkout, `tools/lab-client.ts`, for the commands that work through the running
  lab (`film lab`'s in-lab commands, `film channel`'s feed, `film ask wait`): a session (`initialize`, `notifications/initialized`, the
  id from `Mcp-Session-Id`), then `tools/call` typed by the lab's own tool (its parameters encode the arguments,
  its success decodes `structuredContent`; `film lab` sends a command's checked input as JSON and reads the answer
  back by the command's success), at `FILM_LAB_URL` (else 8229). No lab answering, or one answering in a
  shape this checkout does not read (an older lab), is `LabUnanswered`, which says to start one; a tool's refusal
  is `LabToolRefused`, in the lab's words.
- **Sessions end.** The transport keeps a session until a `DELETE` ends it (it has no expiry), so the lab allows
  one (`allowSessionTermination`) and the client's session lasts as long as its scope: `film lab ask` ends
  its own once answered, and the channel ends each on losing it and the last when it stops. The end is kept
  the moment the lab names the session, so a handshake that fails after `initialize` ends it too. The lab's gate
  takes a `DELETE` only with `Content-Type: application/json`, as every write; a client that sends none gets
  415 and its session stays.

## One command set

Every tool below is one command of the lab's set (`tools/lab-command.ts`, listed in `tools/lab-commands.ts`): its
name, its Effect Schema input, output and refusal, and its effect, defined once. The MCP tool and the terminal's
`film lab <command> [--json]` (`tools/lab-cli.ts`; `bun run lab <command>` in `apps/animations`) are both made
from that definition: the flags from the input schema, by each field's name; `--json` the output schema's value;
the default the command's plain lines. Over the lab's files a terminal runs the command in its own process; over
what only the running lab holds (`overview`, `changes`, `ask`, `timeline`, `working`, `beat_move`, `beat_hold`,
`undo`, `tweak`, `look`, `match`, `critique`) it asks the lab through `lab-client.ts` (`packages/film/README.md`, "The lab's commands", says which
and why). The parity test (`tools/lab-command.test.ts`) holds every tool the lab lists to a `film lab` command
with the same fields. The studio's edits (`beat_move`, `beat_hold`, `undo`) join the set as commands of their own
where the studio's commands are listed (`tools/timeline-mcp.ts`), and `tweak` (`tools/tweak-mcp.ts`) beside them:
a scene's cue timing and knob values are the agents' to set, and no page draws a control for them.

## Tools, resources, prompt

Every tool reads or writes through the store the page and the CLI use (`NotesStore`, `BoardStore`,
`RenderCatalogue`, `ContentStore`, `ProductionStore`); none has a write path of its own. A refusal is an MCP tool error with the
reason in words (`LabRefused`). Links are absolute, at the address the owner opens (`labLink`: the first host
when `FILM_LAB_HOSTS` names one).

| Tool            | Does                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `overview`      | every film (open, replied, tweak notes; board panels kept, beats approved), every set, the cursor                       |
| `changes`       | the feed past `since`, waiting up to `wait` s (≤ 120) for the first change                                              |
| `notes`         | a film's notes (`unresolved` by default, or `all`/`open`/`replied`/`resolved`), each with its link and its still's file |
| `board`         | a film's board: panels, tries (image files on disk), kept, why, approvals, each panel's link                            |
| `catalogue`     | a project folder's renders, approvals and comments (by `film` or `set`)                                                 |
| `sets`, `set`   | the sets the review lists (montage or project, each with something to review), and one set's `review.json`              |
| `reply`         | a reply on a note, by `agent` (`NotesStore.reply`): the page shows it in the thread                                     |
| `resolve`       | marks a note done (`NotesStore.resolve`)                                                                                |
| `request_tweak` | a tweak note on a board panel, its still the try shown (as the Board's Tweak writes one)                                |
| `keep_try`      | keeps one try of a board panel, with why: the Board shows it; a beat approved on another try goes stale                 |
| `approve_beat`  | approves a beat's board as it stands, each picture panel on its kept try; on the owner's word only                      |
| `withdraw_beat` | withdraws a beat's board approval                                                                                       |
| `publish_set`   | copies files into `out/<name>/` and merges keys into its `review.json` (validated as a manifest)                        |
| `record_render` | records a render in a film's project catalogue (`RenderCatalogue.record`)                                               |
| `ask`           | makes an ask from `blocks` or a `machine`, on a page of asks; answers its and its page's links ([Asks](#asks))          |
| `ask_read`      | an ask: where its run is, every answer so far (typed), each step answered, its links, its page                          |
| `asks`          | every ask, newest first, each with its page, narrowed by `status` (`asking`, `answered`, `closed`)                      |
| `close_ask`     | closes an ask with `why`; with a production, files `Decided` (answered) or `Noted` (withdrawn), once, by ask id         |
| `decide`        | files on a production's timeline a decision the owner made in chat, his words verbatim as `quote`                       |
| `note`          | files the owner's feedback from chat on a production's timeline the same way: it decides nothing                        |
| `forward`       | moves a production to its next version on the owner's decision it names, filed in the version open now; refused else    |
| `look`          | stills of a scene as its files stand, each an image after its line (see [The easel's tools](#the-easels-tools))         |
| `match`         | a scene's figures held against their concepts at one place: a table and a side-by-side image each                       |
| `critique`      | the match, and each figure's crops shown to a fresh Opus beside the figure rules: its findings                          |
| `cues`          | each scene's placement, marks and named cues, as `film cues` prints them; one scene's when named                        |
| `check`         | the scenes named (or the film) checked as drawn, `film check --draw`, the findings a page at a time                     |
| `journal`       | a film's journal: the newest entries (of one scene, when named) that fit, the rest counted with its file                |
| `journal_note`  | one observation in a film's journal, of a scene or the whole film, at the time now                                      |
| `timeline`      | a film's timeline at one version (its open one by default): lanes, bands, flags, the nine stages, Next, the header      |
| `working`       | an agent's "doing now" line on a film's studio header, as `by`; `done` clears it (no `text`), 30 min of silence too     |
| `beat_move`     | moves a beat before another, or to the end, through the film's one history of edits                                     |
| `beat_hold`     | sets a beat's lead or tail hold, snapped to 0.1 s, through the same history                                             |
| `tweak`         | sets one value of a scene's literal, a cue's timing or a knob's value, through the same history, and checks after it    |
| `undo`          | undoes the film's newest change, or the one named while no newer one stands                                             |

Resources: `lab://overview`, `lab://changes` (the last 50), `lab://films/{film}/notes`, `lab://films/{film}/board`.
Prompt: `inbox` (every waiting note across the films, and how to work them).

`publish_set` merges at the JSON level, so keys it does not know stay as they were. Given `production` (and
`version`), it stamps the set onto that production's timeline as `film publish` does (`stampedManifest`): the
production must keep a ledger, the version must be one it opened, and `published` is the time now.

## The easel's tools

The owner (2026-10-14): "lets also remove .gent, make it something all agents can benefit from". The tools a
painter works with were a gent extension (`.gent/extensions/film.ts`), which ran the film CLI for gent alone. They
are the lab's now (`tools/easel-mcp.ts`), so every client that reaches the lab paints with them: Claude Code, Codex,
gent, any MCP client. The painter is a brief every agent reads, `.claude/skills/film/reference/scene-painter.md`,
and in Claude Code the `scene-painter` subagent (`.claude/agents/scene-painter.md`: the file tools and these five
tools only, the film skill preloaded), started with the Agent tool. gent's `film.paint`, which started a painter,
is the Agent tool's `subagent_type: scene-painter` now; the compactor that condensed a painter's window from the
files with no model call is the brief's rule to read the state from the files again when its context is condensed.

- **One owner each.** `look` is the lab's own easel (`Easel.look`, the warm export page `film lab look` asks through this MCP),
  its stills answered as MCP images, each after its line (`lookLine`: file, scene, place, time, frame, size, build),
  so the model reads the picture itself. `journal` and `journal_note` are `journal.ts`'s `read` and `note`. `cues`
  and `check` read the film's modules, which the lab never imports (`lab.test.ts`), so they run the film CLI fresh
  (`FreshFilm`), as the lab's after-write check does: `film read cues <film> [scene]` answers `film cues`' lines
  (`sceneReport`) as one line of JSON, and `film check <film> --draw --scene … --allow-stale --json` answers its
  findings. A scene named to `journal` or `journal_note` is found among the film's scenes as the journal knows
  them (`film read scenes <film>`, no timeline resolved), so a scene whose marks do not resolve keeps its journal,
  and one the film lacks is the film's own `UnknownScene`.
- **`films`, the asker's checkout.** Each tool takes `films`, the asker's films folder, absolute
  (`<repo>/apps/animations/src/films`). The lab on 8229 serves one checkout, and an agent in a rift that asked it
  would look at, check and note in another checkout's film under the same name. A folder other than the lab's is
  `LabElsewhere` (`elsewhereOf`, which `Easel.look` checks too), naming both, with the way to a lab of the asker's
  own: `LAB_PORT=<port> bun cli.ts lab` in `apps/animations`, and its MCP at `http://127.0.0.1:<port>/mcp`. The
  folders are compared as the file system resolves them, links followed, so a link to the lab's folder is that
  folder. A relative folder, or one with a `..`, is the call's error: the lab would resolve a relative one in its
  own checkout, and Node's `realpath` takes a `..` before the links it follows, so a link and then `..` would read
  as the lab's folder while leading to another.
- **Answers that fit.** A client cuts a long result (Claude Code warns past 10,000 tokens and cuts past 25,000), and
  a toolkit sends each answer twice, as text and as `structuredContent`. So each answer encodes to at most 8,000
  characters of JSON (`core/tool-pages.ts`) and says how to read on. `check` lists its findings errors first, a page
  at a time; `next` is the `from`, the `report` and the `scenes` asked, to ask again with as it is (a check takes at
  most 24 scenes, each id at most 64 characters, so a cursor that repeats them leaves room for a finding on every
  page), and a page asked of a report whose findings changed since (some fixed, or new) starts again from the first
  and says so (`restarted`), so none is skipped. `cues` answers whole lines; `next` is the line, the column and the
  `scene` asked (a column past 1 goes on inside a line longer than one answer). `cues` times its speech, marks and
  cue spans in seconds into the scene, as `look`'s `at` does; `start=` is the scene's first second in the film, and
  `seam=` how long the pause to the next scene's voice lasts. `journal` answers the newest entries that fit, each
  cut to 800 characters, and how many earlier ones its file holds.
- **Images a model's request takes.** `look` takes 1 to 8 places and a `size` of at most 2,000 pixels (the
  Claude API holds every image to 2,000 pixels a side once a request carries more than 20). A still past 3.75 MB
  (5 MB in base64), or a look's stills past 15 MB together, is `LookTooLarge`, naming each still and its size:
  they are written, and a smaller size, a crop or fewer places reads them. `look` is added to the server by hand
  (`McpServer.addTool`), since a toolkit answers JSON alone; its arguments are decoded as a toolkit's are, and
  ones that do not decode are the call's `InvalidParams`.
- **Refusals in the film's words.** A tool's failure is a tool error: the film's tag, then its words
  (`UnknownScene: the film has no scene "x"; its scenes are …`, `PagesBroken: …`, `FilmUnknown: …`). A fresh run's
  failure keeps the tag it carried (`ServerFailed`'s); a check that cannot run is its one error finding.
- **Long checks.** `check` without `scenes` draws every scene of the film, which takes minutes for a long one (its
  fresh run is given 5). Name the scenes worked on. Codex stops a tool after 60 s unless the server's
  `tool_timeout_sec` says more ([Registration](#registration-the-owner-runs-these)).

`film cues` and `film check` are unchanged: the tools are the same owners, reached through the lab. The easel's
tools are `film lab look|match|critique|cues|check|journal|journal_note` from a terminal (One command set, above).

## Events

One change feed, `LabEvents` (`tools/lab-events.ts`), read off the files themselves every 2 s: each film's
`notes.json` and `board.json`, each project folder's `catalogue.json`, each set's `review.json`, each ask, each
production's ledger. A change the page makes, a terminal's `film lab`, and an agent's MCP call are seen alike, and
nothing writes twice. A change to a film's source (the studio's beat moves and holds, an agent's `beat_move`,
`beat_hold`, `tweak` and `undo`, each undo and redo) is read off the lab's writer, which tells each change that landed in
order (`SourceWriter.landings`, the newest 200), since the page and the agents write through it alike.
What changed between two reads is pure (`core/lab-events.ts`). The first read is the baseline: only what happens
after the lab starts is news. A cursor is `<epoch>.<seq>`; one from another run (the lab restarted) answers every
change kept, flagged `reset`.

| Kind                                                                         | From                                            |
| ---------------------------------------------------------------------------- | ----------------------------------------------- |
| `note.added`, `note.replied`, `note.resolved`                                | a note, a reply (by owner or agent), done       |
| `note.withdrawn`                                                             | a note the owner took back                      |
| `tweak.requested`                                                            | a note asking a tweak of a board panel          |
| `board.tried`, `board.kept`                                                  | a try added; a try kept, with why               |
| `beat.approved`, `beat.withdrawn`                                            | a beat's board approved; its approval withdrawn |
| `render.commented`, `render.approved`, `render.withdrawn`, `render.recorded` | the catalogue's say and renders                 |
| `set.published`, `set.updated`                                               | a set's `review.json` new, or changed           |
| `ask.step`, `ask.answered`, `ask.closed`                                     | a step answered; the ask's end; closed by agent |
| `production.decided`, `production.noted`, `production.asked`                 | a word filed on a production's timeline         |
| `production.forwarded`                                                       | a production moved into its next version        |
| `source.written`, `source.undone`, `source.redone`                           | a film's source changed, undone, made again     |

The kinds are one catalogue, `LAB_EVENTS` (`core/lab-events.ts`): each name, what it says, and how its record is
read. Every event has one payload, `LabChange`: its `id`, `film`, `set`, `note`, `panel`, `beat`, `try`, `address`,
`variant`, `production`, `version`, `ask`, `step` as they apply, `by` (on a production's word, `agent` for an
ask and a note with no quote of the owner's, `owner` else), the words (`text`), an ask's typed
`answers`, a one-line `summary`, the lab `links`, and `read`: the lab command that reads its whole record (the
MCP tool and its arguments, `{name: 'ask_read', arguments: {ask}}`, and its terminal line, `bun cli.ts lab
ask_read --ask a…`; a track's ledger, which no lab command reads, `bun cli.ts production show <p>` alone). A
payload stays under 240 KiB of JSON, so a webhook body with its envelope stays under 256 KiB: one over it leaves
its answers out and cuts its words, said as `trimmed: true`, and `read` has them. `changes` reads the feed by the
catalogue: `name` (globs over its names, `ask.*`, or a record's name for every event it tells: `notes`,
`board`, `catalogue`, `set`, `ask`, `production`, `source`) and `film` keep only those, and a follower narrows
on its own side only a change with no `id` (an older lab's, which reads no filter); the cursor moves past every change
either way. A `name` no event of the catalogue matches, or a film the lab does not have, is refused.

A change's `id` is made from its kind and the record it was read from (a note's
`notes/<film>/<id>@<made>/<seq>`, so a note made after its file was reset takes a new id; a try's
`board/<film>/<panel>/<n>@<made>`; a kept try's with the board's read, so two labs that read the board at
different writes give one keep two ids; an ask's step, a ledger's word,
`source/<film>/<change>/<step>/<n>`): 16 hex of a 64-bit FNV. Two labs that read one change give it one id, so a
reader told it twice (during a restart, below) knows it.

How an agent hears them. Every way below but the first reads one stream (`tools/lab-stream.ts`): a session of
the lab's MCP, the feed long-polled past a cursor (50 s a call), and the cursor the stream's, not the session's.
A lab that stops answering (restarted, the network dropped) is said once and asked again with backoff (250 ms
doubling to 10 s, started over after each session that answered); the new session reads on from the last cursor
seen, so while the same lab runs nothing is missed, unless a reader falls more than the 1000 changes the feed
keeps behind (its cursor comes back `reset`, the older ones gone), and a notes file trashed or restored is told
whole again (each change with the `id` it had); a restarted lab no longer knows the cursor, which comes back
`reset`, and the stream hears every change that lab kept (one heard before comes again with its `id`); a change
made while no lab ran is in the new lab's first read and is never told. A change of a kind this checkout does
not know (a newer lab's), or of a known kind in a shape it does not read (an older lab's, with no `id`), is read
from the fields every change carries (`HeardChange`), never as a lab lost.

1. **`changes` with `wait`** — works in every client, session and subagent. Call it with the cursor from
   `overview`; it answers as soon as there is a change (within the feed's 2 s), or empty after `wait`.
2. **The stream, `film lab events`** (`tools/events-cli.ts`) — `film lab events --follow` keeps running and
   prints one line per event as the lab sees it, so a Claude Code Monitor wakes on each without polling:
   `ask.answered cursor=k3x.12 at=… id=3f0c… film=f ask=a1 summary="…" read="bun cli.ts lab ask_read --ask a1"
   link=…`, the event's name first, the cursor after it, when the lab saw it, its id, what it is about, its
   summary, the command that reads its whole record, and its link. An event of a kind this checkout does not know
   is printed from the shared fields and said once on stderr. `--name` (globs over the catalogue, or a record's
   name, repeated: `--name notes` for a film's notes, tweaks among them) and `--film` narrow it (the lab
   narrows; the follower narrows only an older lab's change, which has no `id`); `--since <cursor>`
   reads on from a line's cursor; `--json` prints `{"cursor":…,"event":…}` a line, the event as the catalogue's
   payload. Without `--follow` it prints the events past `--since` and `cursor=<c>`. What is not an event goes to
   stderr (`lab events: following …`, `lost the lab (…); asking again`, `reconnected to …, reading on from …`,
   the `reset` notice). `--gone-after <dur>` ends it, non-zero, once the lab has been silent that long, counted
   from the first loss since it last answered; without it, only a refusal of the lab's, or an answer this
   checkout cannot read (`LabAnswerUnread`), ends it. Each end is non-zero, and with `--json` its last line on
   stdout is `{"_tag","message"}`.
3. **The channel bridge, `film channel`** — a stdio server Claude Code spawns. It answers the handshake declaring
   `experimental['claude/channel']`, then reads the stream and sends each change as
   `notifications/claude/channel` (`content`: summary, words, link; `meta`: kind, seq, film, note, panel, beat,
   try, variant, by, link). Claude Code shows it in the session as `<channel source="lab-events" kind="…" …>`.
   After a lab restart (its cursor unknown) it sends the newest 20 and a line for the rest.
4. **The latch, `film ask wait`** (`tools/ask-cli.ts`, `tools/ask-wait.ts`) — a command an agent runs in the
   background (Bash `run_in_background`), which exits once the owner has answered, so the agent hears it as the
   command's exit (owner, 2026-10-18: "a latch or something we can use that you can wait on an answer instead of
   asking me"). `film ask wait <ask> [--step <id>]` ends once the ask is answered to its end or closed (with
   `--step`, once that step is answered, or the ask can no longer reach it); `film ask wait --page <ask>` once
   every ask on that ask's page is answered or closed, and `film ask wait --any [--production <p>]` on the first
   ask answered after it began. It takes the cursor, then reads the asks (`asks`): already answered, it ends at
   once; an ask the lab does not have is `AskUnknown`. Then it reads the stream and reads the asks again on a
   change to that ask (`--page`: any ask change, since a joiner may land on the page; `--any`: any
   `ask.answered`) or a `reset`, and on each new session, since a restarted lab saw an answer given while it was
   down as its baseline, not as a change. A lost lab is logged `[ask] wait lab=unreachable` once and never ends
   the wait. It prints the ask as `ask_read` answers it (`ask <id> status=…`, `answered step=…`, `answer <id>
   choose value=… label="…"` / `free_text text="…"` / `skipped`, `closed why="…"`, its links), or one JSON line
   with `--json`, and exits 0; `--timeout <dur>` ends it with `AskWaitTimeout` (`ask.wait.timeout`), non-zero.
5. **MCP Events** (`core/mcp-events.ts`, `tools/mcp-events.ts`) — for a client that subscribes rather than
   listens (protocol 2026-07-28, OpenAI's MCP Events profile). Below.

### MCP Events

Effect's McpServer answers `server/discover` with no `events` capability and none of the events methods
(`events/list` answers MethodNotFound; measured on a spare lab, effect 4.0.2). The lab serves them itself, in a
middleware in front of its MCP route (`eventsRoute`), after the gate has admitted the request: `server/discover`
gains `capabilities.events`, and the three methods are answered there; every other request goes on to Effect's
server. A request carries the 2026-07-28 headers (`mcp-protocol-version`, `mcp-method`) and `params._meta`.

- **`events/list`** answers the catalogue: each of the 25 names with its description, `delivery: ['webhook']`,
  its `inputSchema` (`{film?}`, `additionalProperties: false`: only that film's events) and its `payloadSchema`
  (`LabChange`). Every events result carries `_meta['io.modelcontextprotocol/serverInfo']`, the lab's server
  name and version, as the profile asks.
- **`events/subscribe`** takes `name`, `arguments`, `delivery: {mode: 'webhook', url, secret}`, an optional
  `cursor` and `ttlMs`. The secret is `whsec_` and base64 of 24 to 64 bytes; the URL http or https; arguments
  the input schema's alone. A refusal is -32602 in its words (`no event note.*: the lab's are …`). Before it is
  kept, the callback is verified: posted `{type: 'verification', challenge}`, signed, which it must echo in a
  2xx, as text or `{challenge}` (compared in constant time); otherwise -32015, `CallbackEndpointError`, with
  `data.reason` `challenge_failed`, `timeout` or `unreachable`. The refusal's words name that category alone
  (`the callback did not verify (unreachable)`); what the callback answered goes to the lab's log
  (`mcp.events.unverified`), never to the subscriber. A verified callback stays verified 10 minutes. It answers `id`
  (`sub_` and 24 hex of the digest of the URL, name and arguments, so the same subscribe again is the same
  subscription, refreshed: its secret, cursor and expiry replaced), `refreshBefore` (an ISO time; `ttlMs` null
  asks for none and answers null; left out, a day; at least a minute; over 30 days, refused -32602), `cursor`
  (where it reads on from: for a cursor the feed no longer knows, where the replay of every change it kept
  starts) and `truncated` (a cursor asked for whose history the feed no longer keeps).
- **`events/unsubscribe`** takes `name`, `arguments` and `delivery: {mode, url}`, and answers `{}`.
- **Delivery.** One POST per event: `{eventId, name, timestamp, data, cursor}`, `eventId` `evt_<the change's id>`, the
  body written once and at most 256 KiB (the payload's own bound, above; a body over it is skipped, logged
  `outcome="too large"`). Headers `webhook-id` (the event id),
  `webhook-timestamp`, `webhook-signature` (`v1,` and base64 HMAC-SHA256 of `<id>.<timestamp>.<body>`, keyed by
  the secret's bytes: Standard Webhooks) and `x-mcp-subscription-id`; redirects are not followed. A 2xx is
  delivered; a 410 drops the subscription; a 413 skips the event; anything else, or no answer within 10 s, is
  tried again with the same id and body, a new timestamp and signature, 5 times from 1 s doubling, then logged
  `mcp.events.delivery outcome="given up"` and passed.
- **The store.** `lab/events/subscriptions.json`, new and the module's own: each subscription's id, name,
  arguments, URL, secret, the cursor after the last event it was sent, `refreshBefore`, `made` and `refreshed`.
  A lab that starts drops the ones expired and delivers the rest on from their cursors (a cursor of an earlier
  run reads every change the new run has seen); a subscription that passes its `refreshBefore` is dropped. A
  cursor that cannot be kept (the file unwritable) is logged `mcp.events.cursor.unkept` and delivery goes on.
- **A restart overlaps.** When the lab is restarted, the old lab goes on answering its open long polls, up to
  the 50 s a stream's call waits, and goes on delivering, while the new lab has started over the same files.
  For that window both labs may deliver one event and both write subscription cursors, the last write kept;
  a cursor of the old run, read by the new lab, replays every change the new run has seen. An event's id is
  the change's own, the same from both labs (above), so a subscriber that keeps the `webhook-id`s it has had
  knows a second delivery, and a terminal reader knows a second line by its `id=`. Answering the open long
  polls at once on shutdown would shorten the window; it is not served.
- **Callback URLs.** Any http or https callback is taken, loopback and private addresses among them: only this
  machine and the owner's phone reach `/mcp` (the gate, below), and a subscriber on this machine listens on
  loopback. So a client that reaches `/mcp` can make the lab post signed bodies to an address this machine or
  the tailnet reaches. It learns of that address only the category of the answer (above), redirects are not
  followed, and the body is the lab's own event. That is judged acceptable while only the owner's machines
  reach the lab. Any public route to the lab's MCP (one made for ChatGPT) is a condition change: before it
  opens, callbacks must be https alone, and an address that resolves to loopback, link-local, private or
  tailnet ranges refused (each address the name resolves to, at each delivery).
- **Not served.** Secret rotation with an overlap (signing with two secrets) is not served: a subscribe again
  with a new secret replaces the old at once. The lab provides no public route: ChatGPT reaches a server only
  over public HTTPS, so a ChatGPT subscriber needs one made for it.

What reaches a Claude Code session (2.1.300, per its docs): tool results, always; `list_changed`, which only
refreshes the lists; channel events, only from a stdio server, only in the main session, and only when Claude is
started with `--dangerously-load-development-channels server:lab-events` during the channels preview (ignored
with `-p` and the SDK). `resources/updated`, logging and progress notifications are not shown to the model, so the
lab does not rely on them.

## Who may use it

The lab is reached on this machine's loopback, and from the owner's phone over the tailnet through a forwarder
(`http://100.92.183.50:8230/` → `127.0.0.1:8229`) that names the loopback Host and Origin. The public tunnel is
gone (owner, 2026-10-14: "keep using the tail scale … drop the open tunnel … we don't need really authorization,
will just be secure by obscurity"). So `/mcp` asks no token: it answers whatever passes the lab's own gate (its
Host list, Sec-Fetch-Site, Origin, JSON body, body limit) and Effect's own Origin check, as the page and the API do.

The gate used to swap the request under the routes when it read a write's body, which dropped every
pre-response handler a route set (MCP's `Mcp-Session-Id` among them). A read body is now answered by the
server's own handler as a new request (`api-server.ts`), so a route's answer keeps what it registered.

## Registration (the owner runs these)

```sh
# the lab's tools, in every session (user scope)
claude mcp add --transport http lab http://localhost:8229/mcp -s user
# from another machine on the tailnet: http://100.92.183.50:8230/mcp

# Codex, the same tools; then give a whole film's check time to draw, in
# ~/.codex/config.toml under [mcp_servers.lab]: tool_timeout_sec = 360
codex mcp add lab --url http://localhost:8229/mcp

# a workspace's spare lab (LAB_PORT=<port> bun cli.ts lab, there), as `lab` for that
# workspace alone: run in it; a local server overrides the user's, from the next session
claude mcp add --transport http lab http://127.0.0.1:<port>/mcp -s local

# optional: the owner's actions pushed into a main session
claude mcp add lab-events -s user -e FILM_LAB_URL=http://127.0.0.1:8229/ \
  -- bun /Users/cvr/Developer/personal/bible-tools/apps/animations/cli.ts channel
claude --dangerously-load-development-channels server:lab-events
```

## How agents use it in p5

Before: publish a set by hand (`out/<name>/review.json`), then message three links; poll `film notes` in a
terminal; learn of a pick when told. Now:

1. `overview` → the cursor and what waits.
2. Work; hand it over with `publish_set` (its link is the one to give the owner), or `record_render` for a render.
3. `reply` on the note that asked for it, `resolve` once made; a board tweak is asked with `request_tweak`.
4. `changes {since, wait: 60}` in a loop (a subagent can too), or the channel in the main session: the owner's
   note, pick or approval arrives with its film, panel or render, words and link.
5. A decision that is the owner's ("Needs you"): `ask` it as a page (or, from a terminal, `bun run lab ask --title … --why … --by … --blocks '<json>'`),
   give the owner its page's link (`page.links`: asks made in a row join one page, so hand it once), wait on it
   in the background (`bun cli.ts ask wait <ask>`, or `--page <ask>` for the whole page; never ask him to say he
   answered) or hear the answers on `changes`, act, and `close_ask`. What he has already decided in
   chat is filed with `decide` (feedback, `note`), his words verbatim as `quote`: what is still his to choose is
   an ask, never a `decide`.
6. A scene painted, by the scene painter (`subagent_type: scene-painter`; any other agent reads
   `.claude/skills/film/reference/scene-painter.md`): `journal` and `cues` first, then a passage at a time, `look`
   at its marks and its cues' middles, `journal_note` what a look taught, and `check` the scenes touched before
   stopping.

## Asks

The owner (2026-10-14): "maybe we can make the lab allow for custom pages that you present the decisions needed
… the lab can just simply a set of primitives that you build upon, sort of like codemode … they are used for one
turn, the mcp delivers answers". An **ask** is that page: an agent composes it from the lab's primitives, the owner
answers it on the laptop or the phone, and each answer reaches the agent as a typed event.

### What an agent writes

An ask is data, never code: a small machine of steps, each step a section of blocks (its `title` heading it,
`2 of 3 · The Board`) or an end. The owner sees it as **one scrolling page** (owner, 2026-10-15: "lets always make it
one page no need for multiple pages"): every section his answers so far reach, in order, one Send under them all.
A guard (`next[].when`) makes a section appear once its choice is made, and go when the choice changes; the run
moves only on Send, every section's answers kept in one write. A guided review has one section per piece of
material in the flow's order (script → concept → Board → voice → animatic → Rive scenes → sound → render →
shorts): the material itself first, then its questions, never prose that points elsewhere.

| Block       | Is                                                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `heading`   | a title over what follows                                                                                                          |
| `prose`     | the context the owner decides in                                                                                                   |
| `image`     | a still: `{src}` (a lab path, `/api/…`) or `{board: {film, panel, try}}`, plus a caption                                           |
| `choose`    | choose one of 2–12 options by `id`, always answered; an option may carry an image, and one is `recommended` (listed first, marked) |
| `free_text` | the owner's words by `id`, with a placeholder: optional unless `required: true`                                                    |
| `script`    | the Script reader in place: `{film}` or `{series, draft}`, `beats?`; takes play, marks write back                                  |
| `board`     | the Board's panels in place: `{film, panels?}`, each with its kept try                                                             |
| `video`     | a set's or a render's video in the review's player: `{ref, at?}`                                                                   |
| `audio`     | a recorded take: `{film, beat, attempt?}`, the kept one unless named                                                               |
| `document`  | a set's Markdown, as the set's page reads it: `{ref}`                                                                              |

The material blocks name what they show as the lab lists it (a film, a series' draft, a review ref
`<root>/<folder>/<file>`, never a path on the box), and the lab finds each when the ask is made, through the read
its own view makes (`tools/ask-materials.ts`): one it cannot show is refused, named. A choice made now marks one
option `recommended: true` (two or more options with none is refused when the ask is made; a stored ask is never
checked again).

A choice is the cheap answer; words are a burden to require (owner, 2026-10-14: "in general we should make
textfields optional, required text fields usually are a burden, multiple choice etc is better"). So an agent asks
each question as a `choose` where it can, with an optional `free_text` beside it for anything else. A `free_text`
is optional unless it says `required: true`, which only a step with no `choose` may ask (a name, say). The page
marks an optional field "(optional)" from the flag, never from its label, so a label carries no "(optional)" of
its own. A `choose` has no flag: "no preference" is one of its options. An ask kept before the flag read its words
as required; it reads them as optional now.

```jsonc
{
  "start": "pick",
  "steps": {
    "pick": {
      "blocks": [
        { "kind": "heading", "text": "The church, word beat" },
        { "kind": "choose", "id": "try", "label": "Which try do we keep?",
          "options": [{ "value": "7", "label": "Try 7",
                        "image": { "board": { "film": "righteousness-by-faith", "panel": "word.church", "try": 7 } } }, …] }
      ],
      "next": [{ "to": "why", "when": { "answer": "try", "is": ["7", "8"] } }, { "to": "done" }]
    },
    "why": { "blocks": [{ "kind": "free_text", "id": "why", "label": "Why that one over the first six?" }],
             "next": [{ "to": "done" }] },
    "done": { "end": true, "text": "Thank you. The agent has it." }
  }
}
```

The only branching is `next`: the first way on whose `when` holds (a choice of this step is one of `is`), the
last unguarded. There is no expression language and nothing runs: the machine the lab interprets
(`askMachine`, effect-machine, `core/ask.ts`) is fixed; the agent writes only its table.

Beside the machine the ask records `title`, `why` (what the answer decides), `by` (the agent), `film`, an optional
`deadline` (kept as UTC ISO; no answer is taken after it), and `production` with the `set` it is about.

### Validated before it renders

`ask` runs two checks, and keeps nothing unless both pass; a refusal lists every problem at once:

1. **The machine** (`askProblems`, pure): at most 12 steps, 12 blocks a step, 12 ways on and 12 options; `start` is
   a step; every `to` is a step and not the step itself; the last way on is unguarded and only it; a guard names a
   `choose` of its own step, and only that choose's values; answer ids are unique across the ask; a choose has at
   least two options, each value once, and recommends at most one, which alone may say `why` (shown under the
   options); a `required` free_text is on a step with no choose; an image has `src` or `board`; the ask shows at
   most one `script` (each Script reader owns the page's word commands: ask about the next script in an ask of its
   own); some step ends; every step is reached from `start`; the steps never loop (so every run ends, in at most 12
   pages). A `src` must be a lab path (`/api/…`), so an ask never loads an outside URL. The Schema decode before it
   refuses an unknown block. A script under review is a `script` block (the Script reader, its takes and marks),
   never a `document` of its Markdown.
2. **The material** (`AskStore.make`, `AskMaterials`): every `{board: …}` image is found on its film's board and
   given its `src` (`boardFileUrl`), and every material block is found through the read its own view makes (a
   document or a video among the files the review lists, a film's script or a draft as the Script reader reads it,
   a Board's panels on its board, a take among the beat's attempts) before the record is written; one the lab
   cannot show is a problem like any other, named.

The record keeps the machine as made, its images resolved, so later board edits never change a page the owner
is answering.

### One question stays one line

`blocks` instead of `machine` is the one-page form (`oneQuestion`): the blocks become a step `ask` that goes on to
an end (`thanks`, if given). So the one-question ask is

```jsonc
{
  "title": "A name for the set",
  "why": "…",
  "by": "agent",
  "blocks": [
    { "kind": "free_text", "id": "name", "label": "What do we call it?", "required": true },
  ],
}
```

### Its life

- **Made** (`ask`): checked, resolved, written to `FILMS_LAB/asks/<id>.json` (`a` + 10 hex). Answers its links:
  `local` (where the lab is bound), `phone` (`FILM_LAB_PHONE_URL`, the tailnet address, when set) and `public`
  (the first host `FILM_LAB_HOSTS` names, over HTTPS, when it names one). With `production` and `set`, an `Asked` entry naming the
  ask (`ask: a…`) is filed on that production's ledger, so the timeline shows it waiting on the owner.
- **Answered** one page at a time, from any device: the page posts every section it shows, in order,
  `{sections: [{step, values}, …]}` (`POST /api/asks/<id>/answer`, `AskStore.answerPage`), kept all or none; a
  page opened before the one-page ask sends one `{step, values}`, taken as one section, and an empty `sections` is
  refused (400). The lab moves the machine (`Machine.replay` from the kept state) section by section and appends
  each step to the record's `answered` log. The same answer again (a retry, a second tab) is answered as it is; a
  different one to a step already answered, one to a step the run has left, one past the deadline and one to a
  closed ask are refused (409), and the page reads the ask again, keeps the words of every section still open,
  and says why. A Send the lab never reached keeps the page's answers to send again; one with a question open
  sends nothing, and the page goes to the question and names what it needs. A field left empty is not an answer: the page and the lab drop blank values
  (`filled`) before the check and the log, so an optional field left empty and a retry that sends it blank are the
  same answer. The state lives in the lab's file, not the page, so a reload or a switch from laptop to phone opens
  the ask where it was left.
- **Heard**: the feed reads `FILMS_LAB/asks/` like every other record. `ask.step` carries the step's answers, typed
  (`{kind: 'choose', value, label}`, `{kind: 'free_text', text}`, or `{kind: 'skipped'}` for an optional field the
  owner saw and left empty, by block id; a question on a step never reached has no answer); `ask.answered` carries
  all of them when the run reaches its end. Both arrive through `changes` (a waiting call wakes) and the channel.
  "Reached its end" is read from the `answered` log, not the state's tag, so an answer and a close seen in one look
  of the feed still tell `ask.answered`, then `ask.closed`.
- **Closed** (`close_ask {ask, why}`): it takes no more answers and keeps what it has. An ask with a production
  files what closed it, naming the ask: answered to its end, a `Decided` (text: the answers in a line, a skipped one
  left out; quote: the owner's free text, verbatim); withdrawn before, a `Noted` ("withdrawn: why"). Either answers
  that ask's `Asked` entry and no other, so it stops waiting on the timeline. Each word is filed once by the ask's
  id under the ledger's lock: closing again with the same `why` answers the ask as it is and files only what a
  failed filing left out (the `Asked` among it), and two closes at once file one word.

### Pages of asks

The owner (2026-10-17): "also we should make it so asks get grouped into pages when made sequentially". An ask
made while an earlier ask from the same `by` is still asking joins that ask's page; otherwise it opens a page of
its own. `page` on the `ask` tool (and `--page` on `film lab ask`) names an ask whose page to join, any
ask on it, refused (`AskRefused`) when nothing there still asks; `page: "new"` opens a new one. Each ask stays its
own record, answered, heard and closed alone.

- **Stored** as one optional key: a joiner's record names its page (`page: <ask>`), and a page's id is its first
  ask's id (`pageIdOf`). There is no page file to keep in step: a page is the asks that name it, read when asked
  (`AskStore.page`, `GET /api/asks/<ask>/page`), so an ask on disk from before pages is a page of one. Makes are
  taken one at a time (a semaphore in `AskStore`), so two asks made at once never both open a page.
- **Linked**: `ask` answers `page: {id, links}` beside the ask's own links and says `onPage` ("joined page
  a…, 2 asks" or "opened page a…"); `ask_read` and `asks` name each ask's page. `/asks/page/<id>` is the page;
  `/asks/<ask>` still works and shows the ask's page, taken to that ask.
- **Waited on** with `film ask wait --page <ask>`: it ends once every ask on the page is answered or closed, and
  prints each.

### The page

`/asks/<id>`, a place of the review's page (it opens on a phone at once), and `/asks/page/<id>`, the page of asks
it is on. A page of one ask is the ask's own page, as before. A page of more stacks its asks in the order made,
each its own part with its own Send, under one header that counts them ("1 of 3 answered"; an ask withdrawn
unanswered is not counted). An ask answered or closed folds to one line, its title and its answers, opened for
the whole outcome; the page takes the owner to the next ask still asking (scrolled to it, unless it already starts in
view, so the head and its count stay on screen). After each answer it reads the page again, so
the count moves and an ask that joined since shows. Each part's fields and steps are found within its own
`article.ak[data-ask]`, so two asks with the same step or block ids never meet. The page is composed, not configured:

- `lab/ask/machine.ts`, the page's own machine: Reading → Open → Sending → Open; Refused → Reading (said);
  Unreadable. The send is the state's task, so one answer is out at a time; a draft is checked as the lab will
  check it (`answerRefusal`) before it goes.
- `lab/ask/context.tsx`, the provider: the only place that knows the machine. Parts read `state` (phase, record,
  step, drafted, said) and call `actions` (set, submit).
- `lab/ask/parts.tsx`, compound parts: `Head`, `Step`, `Submit`, `Outcome`, `Status`, and one part per primitive
  (`Heading`, `Prose`, `Picture`, `ChooseOne` over `@bible/ui`'s ToggleGroup, `FreeText`, marked "(optional)" unless
  required), dispatched by `Block` on the block's kind. No part takes a flag that changes what it is; a new
  primitive is a new block kind and a new part.
- Its CSS rides with the place (`PlaceStyle`), so it never weighs on another place's first paint; the CSS budget
  now weighs a place's own styles too.

Proof (2026-10-14, spare lab on 8251): the agent made the church ask above through MCP; the owner's page, at
390×844, picked Try 7 and sent; a second browser opened the same ask on its `why` step, and its send woke an
agent's waiting `changes` with `ask.step` and `ask.answered`, typed; `close_ask` filed `Asked` → `Decided` on
righteousness-by-faith's ledger copy; a real Claude Code session read it back with `ask_read`. Screenshots are
the set `spare/ask-proof`.

### From gent's codemode kernel: taken and left

gent's codemode runs an agent-written program in a cell, under a kernel that owns a state machine of the run. What
an ask needs from it is the discipline, not the runtime.

Taken:

- **The flow as data the kernel interprets**, checked by Schema before anything runs; no functions, no
  expressions. A guard is `{answer, is}`, nothing more.
- **Bounded, terminating runs.** gent caps visits; an ask is acyclic and capped (12 steps), checked up front, which
  is stronger and needs no counter.
- **Persisted state with an append-only log**: the machine's state plus the `answered` log are the record, and a
  run resumes from them on any device.
- **Idempotent, ordered input**: an identical retry is answered as it was; a conflicting or stale one is refused,
  never applied twice.
- **The definition snapshotted at creation**: the machine and its resolved images are kept as made.
- **One turn**: an ask is answered once and then frozen; the agent closes it and asks a new one for a new turn.
- **Only the tools chosen for the turn**: a cell sees only the host tools selected for it; an ask can use only the
  lab's primitives.

Left, and why:

- **Running agent code** (the cell's Bun process): the lab is a long-lived process on the owner's machine, reached
  from a phone over the tailnet; it runs no agent's code. Data in, a fixed interpreter, nothing to sandbox.
- **Thread, run and permit states**: an ask has one reader and one writer at a time; `ContentStore`'s lock is the
  permit.
- **The outbox and activation seam**: the lab is one process and its files are the record; the change feed
  already turns a write into an event, so there is nothing to deliver twice.
- **Natural-language `await` in code**: an agent waits on `changes` (or the channel), as it waits on any other
  thing the owner does.

## Seams with the timeline

The timeline (`ProductionStore`, ledgers in `apps/animations/productions/`, read via `FILMS_PRODUCTIONS`) is the
record of versions and of what waits on the owner; asks file onto it rather than keep a rival model:

- An ask with `production` and `set` is filed as `Asked` when made (with its `point`, the choice in that set, when
  it names one: a pick there answers it on the timeline too), and what closed it (`Decided` with its answers, or
  `Noted` withdrawn) when the agent closes it. The ledger's words carry an optional `ask` id (old ledgers read
  as before; a question filed before the field is known by the `(ask a…)` its text names): a word naming an ask
  answers that ask's question only, and is not a decision on its set, so one
  ask answered on a set leaves another asked on the same set waiting. A bare decision on the set (`decide`) still answers every question on it.
- The `Asked` text names the ask (`(ask a…)`). The timeline does not yet link to the ask's page; a waiting entry
  that is an ask could open it.
- `film lab ask` in a terminal makes the same ask through the running lab (`lab-client.ts`, the `ask` tool), its
  input the tool's own (`--blocks` or `--machine` as JSON, `--set`, `--point`, `--page`), so it lands in the lab's
  own asks and ledger, is filed as above, and is refused in the tool's words. It prints the ask's local and phone
  links and where it waits. With no lab answering it refuses (`LabUnanswered`) and asks nothing. Every question has
  a page: the ledger's `say` takes only the owner's words (`Decided`, `Noted`), and an `Asked` is filed only by an
  ask.
- `decide` and `note` file what the owner said in chat, as `film lab decide|note` does from a terminal, through the same
  `ProductionStore.say`, in the version open when filed. Owner, 2026-10-14: "yes build mcpdecide"; an agent's
  write to a ledger file was refused, and the owner had to run the CLI himself. `quote`, his words verbatim, is
  required and never blank: it is what shows he said it, and keeps an agent from filing a decision he did not
  make. `by` names who filed it; every word keeps it (`by` on the ledger, optional; an ask's words carry the
  asker), `film production show` prints it (`by=…`) and the timeline shows "filed by". The `set` is its ref as
  `sets` lists it or its folder under its root, kept as the folder (`setNamed`); a folder two roots hold is refused here and for `ask` alike. A `point` needs its `set`,
  a `variant` its `point` (`aimedWord`, in the store's `say`); the production must
  keep a ledger (`film production new`). Each call files once: a word filed twice is two words.
- `forward {production, after, title, decision}` moves a production (`film lab forward` from a terminal),
  through the store's `forward`, only on the owner's word to move on: `decision` names one decision of his in
  the version open now (filed by `decide`, or by an ask he answered) by its `at`, and the timeline records that
  one as the reason (`forwardOnDecision`). A stale `after` is refused first (`VersionMoved`); a version with no decision of his is refused (`Undecided`), and a `decision` it does not
  hold, naming those it holds (`DecisionUnknown`). The decision stays his; the tool only carries it out
  (HARNESS6-7).
- Not built: resources over the ledgers.

## Choices the owner may want to change

- No token: the lab answers loopback and the tailnet forwarder only, and the owner prefers obscurity to a key.
- Events by long-poll plus the channel bridge, not resource subscriptions (Effect's HTTP transport has no push,
  and Claude Code does not show `resources/updated` to the model).
- The feed reads every 2 s; an event takes up to 2 s to arrive.
- A tweak asked through MCP sits at its beat's start (T 0), its still the try shown.
- Render comments have no reply thread (the catalogue has none); an agent answers one in a note or a set.
- Sound and look picks (the choices) are not in the feed yet: they live in the films' sources.
- Sets are watched one folder under each review root.
- Asks are acyclic and capped at 12 steps; a flow that needs to loop is asked again as a new ask.
- Words are optional unless an agent requires them, and only on a step with no choice; a choice is always
  answered, so "no preference" is an option the agent offers.
- An answered ask is filed on its production only when the agent closes it, not when the owner answers.
- `FILM_LAB_PHONE_URL` is unset by default; with it unset an ask answers no phone link.
- The review page's head CSS is 52.8 KB of the 64 KiB budget (the Scenes' tape styles left it; Project carries
  its scene cards' as its place's styles); the ask and production places are 54.5 KB and 54.6 KB with their own.
