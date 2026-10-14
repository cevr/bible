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
- Effect's HTTP transport is POST-only: no standalone GET stream, so the server cannot push a notification
  outside a request, and it advertises no resource subscriptions over HTTP. Events therefore come two ways (see
  [Events](#events)): a long-poll tool every session can use, and a stdio bridge for Claude Code's channels.

## Tools, resources, prompt

Every tool reads or writes through the store the page and the CLI use (`NotesStore`, `BoardStore`,
`RenderCatalogue`, `ContentStore`); none has a write path of its own. A refusal is an MCP tool error with the
reason in words (`LabRefused`). Links are absolute, at the address the owner opens (`labLink`: the tunnel's host
when `FILM_LAB_HOSTS` names one).

| Tool            | Does                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `overview`      | every film (open, replied, tweak notes; board panels kept, beats approved), every set, the cursor                       |
| `changes`       | the feed past `since`, waiting up to `wait` s (≤ 120) for the first change                                              |
| `notes`         | a film's notes (`unresolved` by default, or `all`/`open`/`replied`/`resolved`), each with its link and its still's file |
| `board`         | a film's board: panels, tries (image files on disk), kept, why, approvals, each panel's link                            |
| `catalogue`     | a project folder's renders, approvals and comments (by `film` or `set`)                                                 |
| `sets`, `set`   | the sets under the review roots (montage or project), and one set's `review.json`                                       |
| `reply`         | a reply on a note, by `agent` (`NotesStore.reply`): the page shows it in the thread                                     |
| `resolve`       | marks a note done (`NotesStore.resolve`)                                                                                |
| `request_tweak` | a tweak note on a board panel, its still the try shown (as the Board's Tweak writes one)                                |
| `publish_set`   | copies files into `out/<name>/` and merges keys into its `review.json` (validated as a manifest)                        |
| `record_render` | records a render in a film's project catalogue (`RenderCatalogue.record`)                                               |
| `ask`           | makes an ask (a decision page) from `blocks` or a `machine`; answers its links (see [Asks](#asks))                      |
| `ask_read`      | an ask: where its run is, every answer so far (typed), each step answered, its links                                    |
| `asks`          | every ask, newest first, narrowed by `status` (`asking`, `answered`, `closed`)                                          |
| `close_ask`     | closes an ask with `why`; with a production, files `Decided` (answered) or `Noted` (withdrawn), once, by ask id         |

Resources: `lab://overview`, `lab://changes` (the last 50), `lab://films/{film}/notes`, `lab://films/{film}/board`.
Prompt: `inbox` (every waiting note across the films, and how to work them).

`publish_set` merges at the JSON level, so keys it does not know (the timeline's `production`, `version`,
`published`) stay as they were.

## Events

One change feed, `LabEvents` (`tools/lab-events.ts`), read off the files themselves every 2 s: each film's
`notes.json` and `board.json`, each project folder's `catalogue.json`, each set's `review.json`. A change the page
makes, a terminal's `film notes`/`film board`, and an agent's MCP call are seen alike, and nothing writes twice.
What changed between two reads is pure (`core/lab-events.ts`). The first read is the baseline: only what happens
after the lab starts is news. A cursor is `<epoch>.<seq>`; one from another run (the lab restarted) answers every
change kept, flagged `reset`.

| Kind                                                                         | From                                            |
| ---------------------------------------------------------------------------- | ----------------------------------------------- |
| `note.added`, `note.replied`, `note.resolved`                                | a note, a reply (by owner or agent), done       |
| `tweak.requested`                                                            | a note asking a tweak of a board panel          |
| `board.tried`, `board.kept`                                                  | a try added; a try kept, with why               |
| `beat.approved`, `beat.withdrawn`                                            | a beat's board approved; its approval withdrawn |
| `render.commented`, `render.approved`, `render.withdrawn`, `render.recorded` | the catalogue's say and renders                 |
| `set.published`, `set.updated`                                               | a set's `review.json` new, or changed           |
| `ask.step`, `ask.answered`, `ask.closed`                                     | a step answered; the ask's end; closed by agent |

Each carries `film`, `set`, `note`, `panel`, `beat`, `try`, `address`, `variant`, `ask`, `step` as they apply,
`by`, the words (`text`), an ask's typed `answers`, a one-line `summary` and the lab `link`.

How an agent hears them:

1. **`changes` with `wait`** — works in every client, session and subagent. Call it with the cursor from
   `overview`; it answers as soon as there is a change (within the feed's 2 s), or empty after `wait`.
2. **The channel bridge, `film channel`** — a stdio server Claude Code spawns. It answers the handshake declaring
   `experimental['claude/channel']`, then long-polls the lab's `changes` and sends each as
   `notifications/claude/channel` (`content`: summary, words, link; `meta`: kind, seq, film, note, panel, beat,
   try, variant, by, link). Claude Code shows it in the session as `<channel source="lab-events" kind="…" …>`.
   It reconnects every 5 s when the lab is down and reads on from the last cursor it saw, so nothing that
   changed while it was away is skipped; after a lab restart (that cursor unknown) it sends the newest 20 and a
   line for the rest.

What reaches a Claude Code session (2.1.300, per its docs): tool results, always; `list_changed`, which only
refreshes the lists; channel events, only from a stdio server, only in the main session, and only when Claude is
started with `--dangerously-load-development-channels server:lab-events` during the channels preview (ignored
with `-p` and the SDK). `resources/updated`, logging and progress notifications are not shown to the model, so the
lab does not rely on them.

## Who may use it

The lab is also reachable through the OpenTunnel public URL, and the tunnel forwards the visitor's Host and
connects from 127.0.0.1 (the `labtunnel` unit proved a Host bypass), so neither the Host nor the peer address tells
a local agent from the internet. `/mcp` answers only a request that:

- carries `Authorization: Bearer <token>`: the token is 32 random bytes in `~/.config/film-lab/mcp-token`
  (`FILM_LAB_MCP_TOKEN_FILE`), made 0600 in a 0700 folder on the lab's first start and kept across restarts,
  compared by digest;
- names a loopback Host (`127.0.0.1`, `localhost`, `[::1]`), and carries no `Forwarded`, `X-Forwarded-For`,
  `X-Forwarded-Host` or `X-Real-IP`;
- passes the lab's own gate first (its Host list, Sec-Fetch-Site, Origin, JSON body, body limit), and Effect's
  own Origin check.

Without the token it is 401 (`WWW-Authenticate: Bearer`); through the tunnel, 403. The page and the API are
unchanged.

The gate used to swap the request under the routes when it read a write's body, which dropped every
pre-response handler a route set (MCP's `Mcp-Session-Id` among them). A read body is now answered by the
server's own handler as a new request (`api-server.ts`), so a route's answer keeps what it registered.

## Registration (the owner runs these)

```sh
# the lab's tools, in every session (user scope); after the lab has started once
claude mcp add --transport http lab http://localhost:8229/mcp \
  --header "Authorization: Bearer $(cat ~/.config/film-lab/mcp-token)" -s user

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
5. A decision that is the owner's ("Needs you"): `ask` it as a page, give the owner its link, hear the answers on
   `changes`, act, and `close_ask`.

## Asks

The owner (2026-10-14): "maybe we can make the lab allow for custom pages that you present the decisions needed
… the lab can just simply a set of primitives that you build upon, sort of like codemode … they are used for one
turn, the mcp delivers answers". An **ask** is that page: an agent composes it from the lab's primitives, the owner
answers it on the laptop or the phone, and each answer reaches the agent as a typed event.

### What an agent writes

An ask is data, never code: a small machine of steps, each step a page of blocks or an end.

| Block       | Is                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------ |
| `heading`   | a title over what follows                                                                  |
| `prose`     | the context the owner decides in                                                           |
| `image`     | a still: `{src}` (a lab path, `/api/…`) or `{board: {film, panel, try}}`, plus a caption   |
| `choose`    | choose one of 2–12 options by `id`; an option may carry an image (a board try, a set file) |
| `free_text` | the owner's words by `id`, with a placeholder                                              |

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

1. **The machine** (`askProblems`, pure): at most 12 steps, 12 blocks a step, 12 ways on and 12 options; `start`
   is a step; every `to` is a step and not the step itself; the last way on is unguarded and only it; a guard
   names a `choose` of its own step, and only that choose's values; answer ids are unique across the ask; a
   choose has at least two options, each value once; an image has `src` or `board`; some step ends; every step
   is reached from `start`; the steps never loop (so every run ends, in at most 12 pages). A `src` must be a lab
   path (`/api/…`), so an ask never loads an outside URL. The Schema decode before it refuses an unknown block.
2. **The board** (`AskStore.make`): every `{board: …}` image is found on its film's board and given its `src`
   (`boardFileUrl`) before the record is written; a try not on its board is a problem like any other.

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
  "blocks": [{ "kind": "free_text", "id": "name", "label": "What do we call it?" }],
}
```

### Its life

- **Made** (`ask`): checked, resolved, written to `FILMS_LAB/asks/<id>.json` (`a` + 10 hex). Answers its links:
  `local` (where the lab is bound), `phone` (`FILM_LAB_PHONE_URL`, the tailnet address, when set) and `public`
  (the tunnel's host, when `FILM_LAB_HOSTS` names one). With `production` and `set`, an `Asked` entry naming the
  ask (`ask: a…`) is filed on that production's ledger, so the timeline shows it waiting on the owner.
- **Answered** a step at a time, from any device: the page posts `{step, values}` (`POST /api/asks/<id>/answer`);
  the lab moves the machine (`Machine.replay` from the kept state) and appends the step to the record's
  `answered` log. The same answer again (a retry, a second tab) is answered as it is; a different one to a step
  already answered, one to a step the run has left, one past the deadline and one to a closed ask are refused
  (409), and the page reads the ask again and says why. The state lives in the lab's file, not the page, so a
  reload or a switch from laptop to phone opens the ask where it was left.
- **Heard**: the feed reads `FILMS_LAB/asks/` like every other record. `ask.step` carries the step's answers,
  typed (`{kind: 'choose', value, label}` or `{kind: 'free_text', text}`, by block id); `ask.answered` carries all
  of them when the run reaches its end. Both arrive through `changes` (a waiting call wakes) and the channel.
  "Reached its end" is read from the `answered` log, not the state's tag, so an answer and a close seen in one
  look of the feed still tell `ask.answered`, then `ask.closed`.
- **Closed** (`close_ask {ask, why}`): it takes no more answers and keeps what it has. An ask with a production
  files what closed it, naming the ask: answered to its end, a `Decided` (text: the answers in a line; quote: the
  owner's free text, verbatim); withdrawn before, a `Noted` ("withdrawn: why"). Either answers that ask's `Asked`
  entry and no other, so it stops waiting on the timeline. Each word is filed once by the ask's id under the
  ledger's lock: closing again with the same `why` answers the ask as it is and files only what a failed filing
  left out (the `Asked` among it), and two closes at once file one word.

### The page

`/asks/<id>`, a place of the review's page (it opens on a phone at once). The page is composed, not configured:

- `lab/ask/machine.ts`, the page's own machine: Reading → Open → Sending → Open; Refused → Reading (said);
  Unreadable. The send is the state's task, so one answer is out at a time; a draft is checked as the lab will
  check it (`answerRefusal`) before it goes.
- `lab/ask/context.tsx`, the provider: the only place that knows the machine. Parts read `state` (phase, record,
  step, drafted, said) and call `actions` (set, submit).
- `lab/ask/parts.tsx`, compound parts: `Head`, `Step`, `Submit`, `Outcome`, `Status`, and one part per primitive
  (`Heading`, `Prose`, `Picture`, `ChooseOne` over `@bible/ui`'s ToggleGroup, `FreeText`), dispatched by
  `Block` on the block's kind. No part takes a flag that changes what it is; a new primitive is a new block kind
  and a new part.
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
  from a phone and a tunnel; it runs no agent's code. Data in, a fixed interpreter, nothing to sandbox.
- **Thread, run and permit states**: an ask has one reader and one writer at a time; `ContentStore`'s lock is the
  permit.
- **The outbox and activation seam**: the lab is one process and its files are the record; the change feed
  already turns a write into an event, so there is nothing to deliver twice.
- **Natural-language `await` in code**: an agent waits on `changes` (or the channel), as it waits on any other
  thing the owner does.

## Seams with the timeline

The timeline (`ProductionStore`, ledgers in `apps/animations/productions/`, read via `FILMS_PRODUCTIONS`) is the
record of versions and of what waits on the owner; asks file onto it rather than keep a rival model:

- An ask with `production` and `set` is filed as `Asked` when made, and what closed it (`Decided` with its answers,
  or `Noted` withdrawn) when the agent closes it. The ledger's words carry an optional `ask` id (old ledgers read
  as before; a question filed before the field is known by the `(ask a…)` its text names): a word naming an ask
  answers that ask's question only, and is not a decision on its set, so one
  ask answered on a set leaves another asked on the same set waiting. A bare decision on the set (`film production
  decide`) still answers every question on it.
- The `Asked` text names the ask (`(ask a…)`). The timeline does not yet link to the ask's page; a waiting entry
  that is an ask could open it.
- `film production ask` in a terminal still files a bare `Asked` (a question with no page). The next step is for
  it to make an ask (one `free_text`, or a `choose` over the set's options) so every question has a page.
- Not built: `publish_set` taking `production`/`version` (calling `ProductionStore.publish`), resources over the
  ledgers, and `production.*` feed kinds.

## Choices the owner may want to change

- A token rather than an open loopback endpoint (the tunnel makes loopback unprovable).
- Events by long-poll plus the channel bridge, not resource subscriptions (Effect's HTTP transport has no push,
  and Claude Code does not show `resources/updated` to the model).
- The feed reads every 2 s; an event takes up to 2 s to arrive.
- A tweak asked through MCP sits at its beat's start (T 0), its still the try shown.
- Render comments have no reply thread (the catalogue has none); an agent answers one in a note or a set.
- Sound and look picks (the choices) are not in the feed yet: they live in the films' sources.
- Sets are watched one folder under each review root.
- Asks are acyclic and capped at 12 steps; a flow that needs to loop is asked again as a new ask.
- An answered ask is filed on its production only when the agent closes it, not when the owner answers.
- `FILM_LAB_PHONE_URL` is unset by default; with it unset an ask answers no phone link.
- The review page's head CSS is 63.7 KB of the 64 KiB budget; the ask and production places are 65.4 KB and
  65.5 KB with their own styles. The next rule added to the review's shared CSS needs a trim first.
