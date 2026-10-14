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

Each carries `film`, `set`, `note`, `panel`, `beat`, `try`, `address`, `variant` as they apply, `by`, the words
(`text`), a one-line `summary` and the lab `link`.

How an agent hears them:

1. **`changes` with `wait`** — works in every client, session and subagent. Call it with the cursor from
   `overview`; it answers as soon as there is a change (within the feed's 2 s), or empty after `wait`.
2. **The channel bridge, `film channel`** — a stdio server Claude Code spawns. It answers the handshake declaring
   `experimental['claude/channel']`, then long-polls the lab's `changes` and sends each as
   `notifications/claude/channel` (`content`: summary, words, link; `meta`: kind, seq, film, note, panel, beat,
   try, variant, by, link). Claude Code shows it in the session as `<channel source="lab-events" kind="…" …>`.
   It reconnects every 5 s when the lab is down; after a lab restart it sends the newest 20 and a line for the
   rest.

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

## Seams with the timeline (unit `timeline`, not merged)

The timeline's ledger (`FILMS_LAB/productions/<p>.json`, `ProductionStore` in `tools/production-store.ts`) is the
record of versions and asks; the MCP calls its verbs and keeps no rival model:

- `publish_set` gains `production` and `version` and calls `ProductionStore.publish` (which stamps `review.json`)
  instead of writing those keys itself. Until then it leaves them as they are.
- Resources `lab://productions` and `lab://productions/{p}` (`ProductionStore.list`/`read` laid out by
  `productionsOf`), and tools `production_forward`, `production_decide`, `production_note`, mapping one to one onto
  `forward` and `say`.
- `production_ask` is not a tool of its own: an ask becomes the lab's decision page (the owner's next request,
  2026-10-14), filed onto the ledger as an `Asked` entry, its answers as `Said`.
- The feed adds `production.*` kinds by reading the ledger folder, as it reads every other record.

## Choices the owner may want to change

- A token rather than an open loopback endpoint (the tunnel makes loopback unprovable).
- Events by long-poll plus the channel bridge, not resource subscriptions (Effect's HTTP transport has no push,
  and Claude Code does not show `resources/updated` to the model).
- The feed reads every 2 s; an event takes up to 2 s to arrive.
- A tweak asked through MCP sits at its beat's start (T 0), its still the try shown.
- Render comments have no reply thread (the catalogue has none); an agent answers one in a note or a set.
- Sound and look picks (the choices) are not in the feed yet: they live in the films' sources.
- Sets are watched one folder under each review root.
