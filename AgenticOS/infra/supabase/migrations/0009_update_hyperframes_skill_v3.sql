-- Update HyperFrames skill to v3.0.0 (tool-based workflow)
--
-- Previous versions (v1 from migration 0008) referenced terminal CLI commands
-- (npx hyperframes render) or raw HTTP endpoints.  v3 references the dedicated
-- hyperframes_* tools registered in the agent-api, which make direct HTTP calls
-- to the Railway service.  This means the skill works in the SaaS environment
-- with NO terminal, NO npm, NO ffmpeg required on the agent host.
--
-- Run this in the Supabase SQL Editor.

-- Insert new skill version (v2 row = v3.0.0 content) for every workspace
-- that already has the hyperframes skill.
INSERT INTO public.skill_versions (skill_id, workspace_id, version, body, status, safety_status)
SELECT
  ws.id,
  ws.workspace_id,
  2,
  $skill_body$---
name: hyperframes
description: "Create and render videos using HTML compositions via HyperFrames Railway cloud service"
version: 3.0.0
author: O.N.E Platform
license: MIT
platforms: [web]
prerequisites:
  commands: []
  env_vars: [HYPERFRAMES_RAILWAY_URL]
metadata:
  hermes:
    tags: [Video, Rendering, HTML, Animation, Media, Typography]
    requires_toolsets: [hyperframes]
    category: media
config:
  - key: HYPERFRAMES_RAILWAY_URL
    description: "Railway service URL for cloud rendering"
    default: "https://railway-hyperframes-production.up.railway.app"
    prompt: "Enter Railway service URL for cloud rendering"
---

# HyperFrames — Video Rendering via Railway Cloud

HyperFrames renders HTML compositions to MP4 via a Railway cloud service.
**No terminal, no npm, no ffmpeg needed.** Use the dedicated `hyperframes_*` tools.

## When to Use

- Typography videos, kinetic text animations
- Product intros or promotional content
- Animated data visualizations
- Social media videos (TikTok portrait: 1080×1920, YouTube landscape: 1920×1080)

## Available Tools

| Tool | What it does |
|------|-------------|
| `hyperframes_health()` | Verify Railway service is online |
| `hyperframes_create_project(project_name)` | Create a new project slot |
| `hyperframes_upload_composition(project_name, html_content)` | Upload HTML file |
| `hyperframes_lint(project_name)` | Validate structure before rendering |
| `hyperframes_render(project_name, quality)` | Render to MP4 |
| `hyperframes_get_download_url(project_name)` | Get shareable download link |

## Full Workflow

### Step 1 — Check Service
```
hyperframes_health()
```
If this fails, `HYPERFRAMES_RAILWAY_URL` is not set or the service is down.

### Step 2 — Create Project
```
hyperframes_create_project("ai-typography-15s")
```
Use lowercase names with hyphens. Pick a unique name per video.

### Step 3 — Author HTML Composition

Write the full HTML for the video using HyperFrames `data-*` attributes.
The root element must be `<div id="stage">` with `data-composition-id`, `data-width`, `data-height`.
Every timed element needs **`class="clip"`** plus `data-start`, `data-duration`, `data-track-index`.

### Step 4 — Upload Composition
```
hyperframes_upload_composition("ai-typography-15s", "<full HTML here>")
```

### Step 5 — Lint
```
hyperframes_lint("ai-typography-15s")
```
Fix any errors before proceeding. Do not render if lint reports errors.

### Step 6 — Render (always use draft first)
```
hyperframes_render("ai-typography-15s", quality="draft")
```
Draft renders in ~30 seconds. Use `standard` only for final delivery.

### Step 7 — Download URL
```
hyperframes_get_download_url("ai-typography-15s")
```
Give this URL to the user — they can open it in the browser to download the MP4.

---

## Typography Video Template (15-second example)

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; }
    #stage {
      width: 1920px; height: 1080px;
      background: #000;
      overflow: hidden;
      position: relative;
      font-family: 'Arial Black', Impact, sans-serif;
    }
    .word {
      position: absolute;
      width: 100%;
      text-align: center;
      color: #fff;
      font-weight: 900;
      line-height: 1;
    }
  </style>
</head>
<body>
<div id="stage"
     data-composition-id="ai-typography-15s"
     data-start="0"
     data-width="1920"
     data-height="1080">

  <div class="clip word"
       data-start="0" data-duration="2.5" data-track-index="0"
       style="font-size:160px; top:430px; color:#fff;">THE FUTURE</div>

  <div class="clip word"
       data-start="2.5" data-duration="2.5" data-track-index="0"
       style="font-size:120px; top:450px; color:#3b82f6;">IS INTELLIGENT</div>

  <div class="clip word"
       data-start="5" data-duration="2.5" data-track-index="0"
       style="font-size:100px; top:460px; color:#10b981;">AI IS YOUR PARTNER</div>

  <div class="clip word"
       data-start="7.5" data-duration="2.5" data-track-index="0"
       style="font-size:90px; top:465px; color:#f59e0b;">NOT YOUR REPLACEMENT</div>

  <div class="clip word"
       data-start="10" data-duration="1.5" data-track-index="0"
       style="font-size:200px; top:380px; color:#fff;">CREATE</div>

  <div class="clip word"
       data-start="11.5" data-duration="1.5" data-track-index="0"
       style="font-size:200px; top:380px; color:#3b82f6;">THINK</div>

  <div class="clip word"
       data-start="13" data-duration="2" data-track-index="0"
       style="font-size:200px; top:380px; color:#10b981;">BUILD</div>

</div>
</body>
</html>
```

**Key rules:**
- `data-composition-id` on `#stage` must match the `project_name`
- Every timed element must have **`class="clip"`**
- `data-track-index` must be unique per overlapping layer
- All times are in seconds (floats OK: `data-start="2.5"`)

---

## Social Media Sizes

| Format | Width | Height |
|--------|-------|--------|
| YouTube / Desktop | 1920 | 1080 |
| TikTok / Reels | 1080 | 1920 |
| Square (Instagram) | 1080 | 1080 |

Pass `width` and `height` to `hyperframes_render()` to override.

---

## Common Errors

| Error | Fix |
|-------|-----|
| Missing `class="clip"` | Add to every timed element |
| Missing `data-composition-id` | Add it to `<div id="stage">` |
| Overlapping track indices | Different simultaneous layers need different `data-track-index` |
| `HYPERFRAMES_RAILWAY_URL` not set | Set this env var in Railway agent-api service |
| Lint errors before render | Fix all lint errors first |

---

## Notes

- Rendering a 15-second draft video takes ~30 seconds on Railway
- Pure CSS/HTML compositions (no video/audio assets) render fastest
- The `hyperframes_*` tools call the Railway service directly — no terminal or shell needed
- If `hyperframes_render` returns an error, check lint output first
$skill_body$,
  'active',
  'passed'
FROM public.workspace_skills ws
WHERE ws.name = 'hyperframes'
ON CONFLICT (skill_id, version) DO UPDATE
  SET body = EXCLUDED.body,
      status = 'active',
      safety_status = 'passed';

-- Point current_version_id at the new version 2 row
UPDATE public.workspace_skills ws
SET current_version_id = sv.id
FROM public.skill_versions sv
WHERE ws.name = 'hyperframes'
  AND sv.skill_id = ws.id
  AND sv.version = 2;
