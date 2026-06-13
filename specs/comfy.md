# ComfyUI image-generation endpoint

## Context

Add a new async API to the immich-blacksmith sidecar that runs an image through a
ComfyUI workflow and saves the result back into Immich.

Two modes, driven by whether an `assetId` is supplied:

- **img2img** (`assetId` given): use the Immich asset as the workflow input image,
  generate, save the result, and stack it with the original.
- **txt2img** (`assetId` omitted): prompt-only generation; no Immich input, no
  ComfyUI image upload, no stacking — still saves the result to Immich.

Both modes add the generated asset to an "AI Generated" album.

Workflows can run several minutes, so the API is async: submit returns a job id,
the client polls for status. Job state lives in memory (single-instance sidecar).

## Codebase facts (verified)

- TanStack Start + Nitro, TypeScript. File-based routes in `src/routes/`
  (e.g. `api.thumbnail.$id.ts`), handlers via `createFileRoute(...).server.handlers`.
- Immich access via `@immich/sdk`, lazily initialized by `ensureImmichInit()` in
  `src/lib/immich.ts` (`IMMICH_URL` + `IMMICH_API_KEY`). `getImmichWebUrl()` available.
- Validation with `zod`. No job queue / Redis / background-task pattern today.
- Config via `.env` (see `.env.example`). pnpm. No new deps required.
- SDK calls confirmed present: `viewAsset`, `uploadAsset`, `createStack`,
  `getAllAlbums`, `createAlbum`, `addAssetsToAlbum`. `AssetMediaSize` enum =
  `Original | Fullsize | Preview | Thumbnail`.

## Decisions

### 1. Async — in-memory job store

Submit returns a job id immediately; a background task runs the pipeline and
updates an in-memory `Map<jobId, JobRecord>`. Lost on restart — acceptable.
Future (out of scope): persistent store (Redis / local DB) or queue (BullMQ).

### 2. ComfyUI input image (img2img only) — Immich FULLSIZE JPEG

Feed ComfyUI `viewAsset({id, size: AssetMediaSize.Fullsize})`. Immich already
converted HEIC/raw → JPEG, so **no download-original / HEIC / raw decode and no
new image deps** (`sharp`/imagemagick/dcraw all avoided).
Fallback: if Fullsize fails (plain-JPEG assets may lack a fullsize file unless
the server's "Generate full-size preview" setting is on), retry with `Preview`.

### 3. Workflow definition — PLACEHOLDER TEMPLATES in a directory

Workflows are ComfyUI **API-format** JSON files in `COMFYUI_WORKFLOWS_DIR`.
Selected by the optional `workflow` request param (`<dir>/<name>.json`); defaults
to `COMFYUI_DEFAULT_WORKFLOW`. Inputs injected by string-replacing sentinels
before `POST /prompt`:

- `%%PROMPT%%` → text prompt (positive CLIPTextEncode node)
- `%%IMAGE%%` → filename returned by ComfyUI image upload (LoadImage node) — img2img only
- `%%SEED%%` → fresh random seed each run (KSampler) so repeated runs differ

Security: validate `workflow` name against `^[a-zA-Z0-9_-]+$` before filesystem
access (block path traversal). Unknown/invalid name → 400.

Guard: if the chosen template contains `%%IMAGE%%` but no `assetId` was given →
400 ("workflow requires an input image"). An `assetId` with a template lacking
`%%IMAGE%%` is allowed (image simply unused).

### 4. Completion detection — POLL `/history/{prompt_id}`

Background task polls `GET /history/{prompt_id}` every `COMFYUI_POLL_INTERVAL_MS`
(~2500) until the entry exists, then reads `outputs[node].images[]` and downloads
bytes via `GET /view?filename=&subfolder=&type=output`. Overall `COMFYUI_TIMEOUT_MS`
(~600000) fails the job cleanly. No WebSocket.

### 5. Upload result to Immich — `uploadAsset` (SDK)

`uploadAsset({assetMediaCreateDto: {assetData, deviceAssetId, deviceId,
fileCreatedAt, fileModifiedAt, filename}})`. Defaults:

- `deviceId = "immich-blacksmith"`
- `deviceAssetId = "comfyui-<sourceId|txt2img>-<timestamp>"`
- `fileCreatedAt/ModifiedAt = now`, `filename = "<originalBasename>-comfyui.<ext>"`
  (txt2img: `"comfyui-<timestamp>.<ext>"`).

### 6. Relate result — STACK (img2img only) + "AI Generated" ALBUM (both)

Stack (img2img only): `createStack({stackCreateDto:{assetIds:[originalId, newId]}})`.
Original stays primary. Per Immich docs, when a provided id is the primary of an
existing stack, that stack **merges into the new one** — so repeated edits of the
same original accumulate into one stack automatically. Best-effort; on failure
log and continue (asset is still uploaded/returned).

Album (both modes): ensure `COMFYUI_ALBUM_NAME` (default "AI Generated") via
`getAllAlbums()` matched by `albumName`; create with `assetIds:[newId]` if absent,
else `addAssetsToAlbum`.

### 7. Config + auth

New env (all but `COMFYUI_URL` optional, with defaults):

- `COMFYUI_URL` (required, e.g. `http://comfyui:8188`)
- `COMFYUI_WORKFLOWS_DIR` (default: bundled `src/lib/comfyui/workflows/`)
- `COMFYUI_DEFAULT_WORKFLOW` (default: e.g. `default`)
- `COMFYUI_ALBUM_NAME` (default `"AI Generated"`)
- `COMFYUI_TIMEOUT_MS` (default `600000`), `COMFYUI_POLL_INTERVAL_MS` (default `2500`)

Auth: none — matches the rest of the sidecar (trusted/private network).

### 8. API contract

- `POST /api/comfyui/generate` — body `{prompt: string(min 1), assetId?: uuid,
workflow?: string}`. Validates (zod), runs the img2img-guard, creates a job,
  starts the background pipeline, returns `202 {jobId, status:"pending"}`.
- `GET /api/comfyui/jobs/$jobId` — returns the job record; `404` if unknown.

JobRecord:

```
status: "pending" | "downloading" | "uploading-to-comfyui" | "running"
      | "saving" | "completed" | "failed"
createdAt, updatedAt, promptId?
completed → { newAssetId, stackId?, addedToAlbum: boolean }
failed    → { error: string, failedStage: string }
```

- Retention: evict completed/failed jobs ~1h after they finish (avoid unbounded map).
- Concurrency: allowed; defer queuing to ComfyUI's own `/prompt` server-side queue.

## Implementation outline

New files:

- `src/lib/comfyui/client.ts` — typed ComfyUI HTTP client: `uploadImage(blob)`
  (`POST /upload/image`, returns filename), `queuePrompt(graph)` (`POST /prompt`,
  returns `prompt_id`), `waitForResult(promptId, {timeout, interval})` (poll
  `/history`), `downloadOutput({filename,subfolder,type})` (`GET /view`).
- `src/lib/comfyui/workflow.ts` — load template by validated name, inject
  `%%PROMPT%%/%%IMAGE%%/%%SEED%%`, the img2img guard, `%%IMAGE%%`-presence check.
- `src/lib/comfyui/jobs.ts` — in-memory job store: `create`, `update`, `get`, TTL
  eviction; the `runPipeline(job, input)` orchestrator (download → upload →
  queue → poll → save → stack → album), updating status at each stage.
- `src/lib/comfyui/workflows/default.json` — bundled API-format template (user
  supplies their JSON; add the placeholders).
- `src/routes/api.comfyui.generate.ts` — POST handler (pattern from
  `api.thumbnail.$id.ts` / zod usage in `api.similar.$id.ts`).
- `src/routes/api.comfyui.jobs.$jobId.ts` — GET status handler.

Edits:

- `.env.example` — document the new `COMFYUI_*` vars.
- Reuse `ensureImmichInit()` from `src/lib/immich.ts` in the pipeline.

Pipeline (img2img): download Fullsize → `uploadImage` → inject placeholders →
`queuePrompt` → `waitForResult` → `downloadOutput` → `uploadAsset` →
`createStack([original,new])` → ensure album. txt2img: skip download/upload/stack;
inject prompt+seed only.

## Verification

1. `pnpm typecheck` and `pnpm lint` clean.
2. With a reachable ComfyUI + `COMFYUI_URL` set, run `pnpm dev` and:
   - **img2img:** `POST /api/comfyui/generate {assetId, prompt}` → expect `202`
     - `jobId`. Poll `GET /api/comfyui/jobs/<jobId>` through statuses to
       `completed` with `newAssetId`. In Immich: new asset exists, is stacked under
       the original, and is in the "AI Generated" album. Run a 2nd edit of the same
       original → both edits land in one stack (merge behavior).
   - **txt2img:** same POST without `assetId` → completes, asset in album, no stack.
3. Error paths: invalid body → 400; unknown `workflow` / traversal attempt → 400;
   img2img-only template without `assetId` → 400; unknown jobId → 404; ComfyUI
   unreachable or timeout → job ends `failed` with `failedStage`.
4. Repeated runs produce different images (seed randomization).
