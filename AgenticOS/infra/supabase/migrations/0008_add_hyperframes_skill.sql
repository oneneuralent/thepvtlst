-- Add HyperFrames video rendering skill to all workspaces
-- This skill enables AI agents to create and render videos using HTML compositions

-- Insert skill metadata for all existing workspaces
INSERT INTO public.workspace_skills (workspace_id, name, category, description, scope, status)
SELECT 
  id,
  'hyperframes',
  'media',
  'Create and render videos using HTML compositions via HyperFrames CLI (local or Railway cloud)',
  'workspace',
  'active'
FROM public.workspaces
ON CONFLICT (workspace_id, name) DO NOTHING;

-- Insert skill version with full content for all hyperframes skills
INSERT INTO public.skill_versions (skill_id, workspace_id, version, body, status, safety_status)
SELECT 
  ws.id,
  ws.workspace_id,
  1,
  $skill_body$---
name: hyperframes
description: "Create and render videos using HTML compositions via HyperFrames CLI (local or Railway cloud)"
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
prerequisites:
  commands: [node, npx]
  env_vars: []
metadata:
  hermes:
    tags: [Video, Rendering, HTML, Animation, Media]
    requires_toolsets: []
    category: media
config:
  - key: HYPERFRAMES_RAILWAY_URL
    description: "Railway service URL for cloud rendering (e.g., https://railway-hyperframes-production.up.railway.app)"
    default: ""
    prompt: "Enter Railway service URL for cloud rendering (leave blank for local mode)"
---

# HyperFrames - HTML to Video Rendering

HyperFrames is an open-source video rendering framework: write HTML compositions, render to MP4. This skill wraps the HyperFrames CLI for AI agent-driven video creation.

## When to Use

Use this skill when you need to:
- Create product videos, intros, or promotional content
- Generate animated data visualizations
- Produce social media videos (TikTok, Instagram Reels)
- Create kinetic typography or motion graphics
- Turn web content into video format

## Prerequisites

**Required commands:**
- `node` (>= 22) - For running HyperFrames CLI
- `npx` - For executing HyperFrames without installation
- `ffmpeg` - Only required for local rendering (not needed for Railway cloud mode)

**Install Node.js:**
```bash
# macOS (Homebrew)
brew install node

# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Windows
# Download from https://nodejs.org/
```

**Install FFmpeg (local rendering only):**
```bash
# macOS (Homebrew)
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg

# Windows (Chocolatey)
choco install ffmpeg
```

**Verify installation:**
```bash
node --version  # Should be >= 22
npx --version
ffmpeg -version  # Only if using local rendering
```

## Rendering Modes

This skill supports two rendering modes:

### Local Mode
- Runs HyperFrames CLI on your local machine
- Requires FFmpeg installed locally
- Best for development and testing
- Uses your local CPU/GPU

### Railway Cloud Mode
- Uses Railway service for rendering
- No FFmpeg required locally
- Better for production and team use
- Set `HYPERFRAMES_RAILWAY_URL` config to enable

**To use Railway mode:**
1. Deploy the Railway service (see railway-hyperframes repo)
2. Set the Railway URL in skill config: `HYPERFRAMES_RAILWAY_URL=https://railway-hyperframes-production.up.railway.app`
3. Use the Railway client script instead of direct CLI commands

## Quick Reference

### Local Mode Commands
| Command | Purpose |
|---------|---------|
| `npx hyperframes init <name>` | Scaffold new project |
| `npx hyperframes lint` | Validate HTML structure |
| `npx hyperframes preview` | Live preview in browser |
| `npx hyperframes render` | Render to MP4 |
| `npx hyperframes add <block>` | Add catalog block |

### Railway Cloud Mode Commands
| Command | Purpose |
|---------|---------|
| `python scripts/railway_client.py health` | Check Railway service health |
| `python scripts/railway_client.py create <project>` | Create project on Railway |
| `python scripts/railway_client.py upload <project> <html>` | Upload composition |
| `python scripts/railway_client.py lint <project>` | Lint composition |
| `python scripts/railway_client.py render <project> [quality]` | Render video |
| `python scripts/railway_client.py download <project> <output>` | Download video |
| `python scripts/railway_client.py delete <project>` | Delete project |

## Procedure

### Local Mode Workflow

#### Step 1: Scaffold Project

Create a new HyperFrames project:

```bash
npx hyperframes init my-video
cd my-video
```

This creates:
- `index.html` - Root composition
- `compositions/` - Sub-compositions
- `assets/` - Media files
- `meta.json` - Project metadata

**Options:**
```bash
npx hyperframes init my-video --example warm-grain    # Use template
npx hyperframes init my-video --video clip.mp4        # With video file
npx hyperframes init my-video --audio track.mp3       # With audio file
npx hyperframes init my-video --tailwind              # With Tailwind CSS
```

#### Step 2: Author HTML Composition

Edit `index.html` to define your video. HyperFrames uses HTML with `data-*` attributes:

```html
<div id="stage" 
     data-composition-id="my-video" 
     data-start="0" 
     data-width="1920" 
     data-height="1080">
    
    <video id="clip-1" 
           data-start="0" 
           data-duration="5" 
           data-track-index="0" 
           src="intro.mp4" 
           muted 
           playsinline></video>
    
    <img id="overlay" 
         class="clip" 
         data-start="2" 
         data-duration="3" 
         data-track-index="1" 
         src="logo.png" />
    
    <audio id="bg-music" 
           data-start="0" 
           data-duration="9" 
           data-track-index="2" 
           data-volume="0.5" 
           src="music.wav"></audio>
</div>
```

**Key Attributes:**
- `data-composition-id` - Unique identifier for the composition
- `data-start` - Start time in seconds
- `data-duration` - Duration in seconds
- `data-track-index` - Track number (0=video, 1=overlay, 2=audio, etc.)
- `class="clip"` - Required for all timed elements

#### Step 3: Add Animation (Optional)

Use GSAP for timeline animation:

```html
<script>
const timeline = gsap.timeline({ paused: true });
timeline.to("#overlay", { opacity: 1, duration: 1, delay: 2 });
window.__timelines = { main: timeline };
</script>
```

#### Step 4: Lint and Validate

Check your composition before rendering:

```bash
npx hyperframes lint          # Static HTML structure check
npx hyperframes validate      # Runtime check (headless Chrome)
```

Fix any errors before proceeding.

#### Step 5: Preview

Preview in browser with live reload:

```bash
npx hyperframes preview
```

Opens studio at `http://localhost:3002`

#### Step 6: Render

Render to MP4:

```bash
npx hyperframes render --output output.mp4
```

**Quality options:**
```bash
npx hyperframes render --quality draft        # Fast, for iteration
npx hyperframes render --quality standard     # Default
npx hyperframes render --quality high         # Best quality
```

**GPU acceleration (if available):**
```bash
npx hyperframes render --gpu                  # Hardware encoding
```

**Docker mode (deterministic):**
```bash
npx hyperframes render --docker               # Identical output across platforms
```

## Composition Structure

### Root Composition (index.html)

The main timeline that references sub-compositions:

```html
<div id="stage" data-composition-id="root" data-start="0" data-width="1920" data-height="1080">
    <!-- Video track -->
    <video data-start="0" data-duration="10" data-track-index="0" src="main.mp4"></video>
    
    <!-- Sub-composition slot -->
    <iframe data-start="3" data-duration="5" data-track-index="1" src="compositions/intro.html"></iframe>
    
    <!-- Audio track -->
    <audio data-start="0" data-duration="10" data-track-index="2" src="music.mp3"></audio>
</div>
```

### Sub-Compositions

Reusable scenes in `compositions/` directory:

```html
<!-- compositions/intro.html -->
<div id="stage" data-composition-id="intro" data-start="0" data-width="1920" data-height="1080">
    <h1 class="clip" data-start="0" data-duration="3">Welcome</h1>
</div>
```

## Using Catalog Blocks

Add pre-built components from the HyperFrames catalog:

```bash
npx hyperframes add flash-through-white    # Shader transition
npx hyperframes add instagram-follow       # Social overlay
npx hyperframes add data-chart             # Animated chart
```

Browse full catalog: https://hyperframes.heygen.com/catalog

## Design System

If a `design.md` file exists in your project, read it first for brand colors, fonts, and constraints. Use exact values from the file - don't invent colors or substitute fonts.

**Example design.md:**
```yaml
colors:
  primary: "#3b82f6"
  secondary: "#10b981"
  background: "#0f172a"
fonts:
  heading: "Inter"
  body: "system-ui"
```

## Best Practices

1. **Layout Before Animation** - Build the end-state first, then add motion
2. **Use Sub-Compositions** - Break complex videos into reusable scenes
3. **Lint Before Render** - Always run `npx hyperframes lint` first
4. **Preview Often** - Use `npx hyperframes preview` for quick iteration
5. **Start with Draft Quality** - Use `--quality draft` during development
6. **Deterministic Rendering** - Use `--docker` for CI/CD pipelines

## Pitfalls

**Common Errors:**
- Missing `class="clip"` on timed elements → Add `class="clip"` to all elements with `data-start`
- Overlapping tracks → Check `data-track-index` values don't conflict
- Missing `data-composition-id` → Add unique ID to stage div
- FFmpeg not found → Install FFmpeg and verify in PATH
- Node version < 22 → Upgrade to Node.js 22 or later

**Timing Issues:**
- Clips extending beyond composition duration → Adjust `data-duration`
- Gaps in timeline → Ensure continuous coverage or intentional gaps
- Audio/video sync issues → Check `data-start` values match

**Asset Issues:**
- Missing media files → Verify assets are in `assets/` directory
- Wrong file paths → Use relative paths from composition location
- Large file sizes → Optimize media before rendering

## Verification

**After rendering, verify:**
1. Output file exists in `renders/` directory
2. Video plays correctly in media player
3. Duration matches expected length
4. Audio is synced with video
5. No visual artifacts or glitches

**Test command:**
```bash
# Check output file
ls -lh renders/

# Play video (macOS)
open renders/output.mp4

# Play video (Linux)
xdg-open renders/output.mp4

# Play video (Windows)
start renders/output.mp4
```

## Advanced Features

### Transparent Video

Render with transparency for overlays:

```bash
npx hyperframes render --format mov --output transparent.mov
```

### Custom Resolution

```bash
npx hyperframes render --width 1280 --height 720 --output hd.mp4
```

### Frame Rate Control

```bash
npx hyperframes render --fps 60 --output 60fps.mp4
```

### Multiple Workers

```bash
npx hyperframes render --workers 4 --output fast.mp4
```

### Railway Cloud Mode Workflow

#### Step 1: Check Service Health

```bash
python scripts/railway_client.py health
```

#### Step 2: Create Project

```bash
python scripts/railway_client.py create my-video
```

#### Step 3: Author HTML Composition

Create your HTML composition locally (same as local mode). Save it as `index.html`.

#### Step 4: Upload Composition

```bash
python scripts/railway_client.py upload my-video index.html
```

#### Step 5: Upload Assets (if any)

```bash
python scripts/railway_client.py upload_asset my-video assets/logo.png
python scripts/railway_client.py upload_asset my-video assets/music.mp3
```

#### Step 6: Lint Composition

```bash
python scripts/railway_client.py lint my-video
```

#### Step 7: Render Video

```bash
python scripts/railway_client.py render my-video standard
```

Quality options: `draft`, `standard`, `high`

#### Step 8: Download Video

```bash
python scripts/railway_client.py download my-video output.mp4
```

#### Step 9: Clean Up (optional)

```bash
python scripts/railway_client.py delete my-video
```

## Resources

- **Documentation:** https://hyperframes.heygen.com
- **GitHub:** https://github.com/heygen-com/hyperframes
- **Catalog:** https://hyperframes.heygen.com/catalog
- **Example Project:** https://github.com/heygen-com/hyperframes-launch-video

## Notes

- HyperFrames requires Node.js 22 or later
- Rendering is CPU-intensive; allow sufficient time
- Use `--quality draft` for fast iteration during development
- Docker mode provides deterministic output across platforms
- GPU acceleration requires compatible hardware
- Railway cloud mode requires `HYPERFRAMES_RAILWAY_URL` config to be set
- Railway client script requires `requests` Python library: `pip install requests`
$skill_body$,
  'active',
  'passed'
FROM public.workspace_skills ws
WHERE ws.name = 'hyperframes';

-- Link skill to its version
UPDATE public.workspace_skills ws
SET current_version_id = sv.id
FROM public.skill_versions sv
WHERE ws.name = 'hyperframes'
AND sv.skill_id = ws.id
AND sv.version = 1;
