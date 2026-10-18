# Image generation and editing

Use `--category image --mode write`. Agybird instructs Antigravity to use its built-in image generation; a prose-only answer is not image-generation success. Since `agy` 1.2.16 the main agent hands image work to a built-in `image-generator` subagent, which calls `generate_image`, checks each result, and saves the image into the conversation's artifact directory. The subagent appears in `subagents[]` and as an `invoke_subagent` entry in `tool_calls`.

## Generate a new image

Give Antigravity the intended subject, composition, style, aspect ratio (`1:1`, `16:9`, `4:3`, `9:16`, `3:2`, `2:3`), text requirements, and destination constraints. Do not choose a reasoning model merely to select an image model; image generation is provided by the `image-generator` subagent and its `generate_image` tool.

## Edit a reference image

Pass each source with a repeated absolute `--reference` argument. Agybird asks for these paths to be passed to image generation as its `ImagePaths` input. Describe what must change and what must remain unchanged. Supported raster formats include PNG, JPG, JPEG, WebP, and GIF.

## Verify independently

Accept success only when all of these are true:

1. Image generation is observed: a completed `generate_image` call in `tool_calls`, or a completed `invoke_subagent` call with an `image-generator` entry in `subagents[]`.
2. At least one artifact is an existing, nonempty supported raster file inside the working directory, or inside Antigravity's `brain/<conversation_id>` directory for this run's conversation or its `image-generator` subagent. The subagent reports no path, so the runner also accepts images saved directly in those directories after the run started; an image left by an earlier turn does not count.
3. Open every resulting image and inspect it visually against the request.

The image usually stays in `brain/<conversation_id>/`, often as a JPEG with a generated name. Agybird tells Antigravity not to copy, convert, or resize it with shell commands, because a headless run cannot approve that command and it ends as a denied action. When the user wants the image at a particular path or format, copy or convert the reported artifact yourself after verifying it.

Treat a missing artifact, empty file, unsupported extension, failed tool event, or visually incorrect result as incomplete. Iterate through a new explicit `agy` call when correction is needed.

Official references: [artifacts](https://antigravity.google/docs/cli/artifacts) and [plugins and skills](https://antigravity.google/docs/cli/plugins).
