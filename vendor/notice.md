# Third-party software

The browser wrapper @ffmpeg/ffmpeg 0.12.15 is MIT-licensed. Copyright (c) 2019 Jerome Wu. See LICENSE-wrapper.txt.
Source: https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v0.12.15/packages/ffmpeg

The unmodified @ffmpeg/core 0.12.10 ESM binary and loader were obtained from:
https://registry.npmjs.org/@ffmpeg/core/-/core-0.12.10.tgz
The core includes FFmpeg and third-party codecs, including GPL codecs. The combined core is subject to GPLv3; see LICENSE-GPLv3.txt and upstream component notices.
Corresponding build scripts, patches and component source references:
https://github.com/ffmpegwasm/ffmpeg.wasm/tree/core%40v0.12.10
https://github.com/ffmpegwasm/ffmpeg.wasm/tree/main/build
https://github.com/FFmpeg/FFmpeg/tree/n5.1.4
https://ffmpegwasm.netlify.app/docs/overview/
License details: https://ffmpegwasm.netlify.app/docs/faq/

No changes were made to the vendored engine or wrapper. The engine is loaded only after the user starts a conversion. Media is processed in a worker on the user's device.
