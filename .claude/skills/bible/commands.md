# Bible CLI Command Reference

## Command Structure

```
bible <command> <subcommand> [options]
```

**Important:** The `--model` flag is required for all generation/revision
commands.

## Messages Command

### `messages generate`

Generate a new sermon message on a given topic.

```bash
bible messages generate --model anthropic --topic "Topic text"
```

**Options:**

- `--topic, -t` (required): The topic for the message
- `--model, -m` (required): AI model provider (gemini, openai, anthropic, kimi)

**Output:** Creates `outputs/messages/YYYY-MM-DD-slug.md` and exports to Apple
Notes "messages" folder.

### `messages revise`

Revise an existing message with specific instructions.

```bash
bible messages revise --model anthropic --file <path> --instructions "Revision text"
```

**Options:**

- `--file, -f` (required): Path to the message file
- `--instructions, -i` (required): Revision instructions
- `--model, -m` (required): AI model provider

### `messages list`

List all existing messages.

```bash
bible messages list [--json]
```

**Options:**

- `--json`: Output as JSON array of paths

### `messages from-note`

Generate a message from an Apple Note.

```bash
bible messages from-note --model anthropic --note-id <id>
```

**Options:**

- `--note-id, -n` (required): Apple Note ID
- `--model, -m` (required): AI model provider

### `messages generate-topic`

Auto-generate a topic suggestion based on previous messages.

```bash
bible messages generate-topic --model anthropic
```

## Sabbath School Command

### `sabbath-school process`

Download and process Sabbath School lesson.

```bash
bible sabbath-school process --model anthropic --year 2025 --quarter 2 [--week 5]
```

**Options:**

- `--year, -y` (required): Year (e.g., 2025)
- `--quarter, -q` (required): Quarter (1-4)
- `--week, -w` (optional): Specific week (1-13), or processes current week
- `--model, -m` (required): AI model provider

**Output:** Creates `outputs/sabbath-school/YYYY-QX-WY.md`

### `sabbath-school revise`

Revise Sabbath School outline.

```bash
bible sabbath-school revise --model anthropic --year 2025 --quarter 2 --week 5
```

### `sabbath-school export`

Export Sabbath School outline to Apple Notes.

```bash
bible sabbath-school export --year 2025 --quarter 2 [--week 5]
```

**Output:** Exports to Apple Notes "sabbath school" folder.

## Studies Command

### `studies generate`

Generate a new Bible study on a given topic.

```bash
bible studies generate --model anthropic --topic "Topic text"
```

**Options:**

- `--topic, -t` (required): The study topic
- `--model, -m` (required): AI model provider

**Output:** Creates `outputs/studies/YYYY-MM-DD-slug.md` and exports to Apple
Notes "studies" folder.

### `studies revise`

Revise an existing study.

```bash
bible studies revise --model anthropic --file <path> --instructions "Revision text"
```

**Options:**

- `--file, -f` (required): Path to the study file
- `--instructions, -i` (required): Revision instructions
- `--model, -m` (required): AI model provider

### `studies list`

List all existing studies.

```bash
bible studies list [--json]
```

### `studies from-note`

Generate a study from an Apple Note.

```bash
bible studies from-note --model anthropic --note-id <id>
```

## Readings Command

### `readings process`

Process chapter readings.

```bash
bible readings process --model anthropic [chapter] [--target study|slides|speaker-notes]
```

**Options:**

- `chapter` (optional): Specific chapter number
- `--target, -t` (optional): Target output types (can be repeated)
- `--model, -m` (required): AI model provider

### `readings revise`

Revise a reading file.

```bash
bible readings revise --model anthropic --file <path> --instructions "text"
```

### `readings list`

List all readings.

```bash
bible readings list [--json]
```

## Export Command

### `export`

Export files to Apple Notes.

```bash
bible export --files <path1> --files <path2> ...
```

**Options:**

- `--files, -f` (required, repeatable): Files to export

## Model Options

Available model providers (via `--model` flag):

- `gemini` - Google Gemini
- `openai` - OpenAI GPT
- `anthropic` - Anthropic Claude

Models are configured via environment variables:

- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

## Output Directory Structure

```
packages/cli/outputs/
├── messages/
│   └── 2025-01-04-hope-in-christ.md
├── sabbath-school/
│   └── 2025-Q2-W5.md
├── studies/
│   └── 2025-01-04-faith-and-works.md
└── readings/
    ├── chapter-1-study.md
    ├── chapter-1-slides.md
    └── chapter-1-speaker-notes.md
```

## Apple Notes Folders

Content is automatically exported to these Apple Notes folders:

- `messages` - Generated messages
- `studies` - Bible studies
- `sabbath school` - Sabbath School outlines
