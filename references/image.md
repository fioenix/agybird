# Image generation and editing

Use `--category image --mode write`. Agybird instructs Antigravity to use its built-in `generate_image` tool; a prose-only answer is not image-generation success.

## Generate a new image

Give Antigravity the intended subject, composition, style, aspect ratio, text requirements, and destination constraints. Do not choose a reasoning model merely to select Nano Banana; image generation is provided through the auxiliary `generate_image` tool.

## Edit a reference image

Pass each source with a repeated absolute `--reference` argument. Agybird maps these paths into the tool's `ImagePaths` input. Describe what must change and what must remain unchanged.

## Verify independently

Accept success only when all of these are true:

1. A completed `generate_image` tool call appears in `tool_calls`.
2. At least one returned artifact is an existing, nonempty supported raster file inside the working directory or Antigravity's `brain/<conversation_id>` artifact directory for that exact result.
3. Open every resulting image and inspect it visually against the request.

Treat a missing artifact, empty file, unsupported extension, failed tool event, or visually incorrect result as incomplete. Iterate through a new explicit `agy` call when correction is needed.

Official references: [artifacts](https://antigravity.google/docs/cli/artifacts) and [plugins and skills](https://antigravity.google/docs/cli/plugins).
