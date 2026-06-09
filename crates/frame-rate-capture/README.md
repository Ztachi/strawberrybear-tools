# frame-rate-capture

Reusable process FPS capture facade for desktop tools.

## Platform Support

| Platform | Provider               | Status                    |
| -------- | ---------------------- | ------------------------- |
| Windows  | PresentMon / ETW       | Supported in v1           |
| macOS    | Reserved provider slot | Manual FPS fallback in v1 |
| Linux    | Reserved provider slot | Manual FPS fallback in v1 |

The public API stays the same on every platform. Unsupported providers return
`CaptureStatus::UnsupportedPlatform` so applications can keep the same UI entry
and fall back to manual FPS without hard-coding platform checks in business views.

## API

```rust
use frame_rate_capture::{FrameRateCapture, FrameRateCaptureOptions};

let mut capture = FrameRateCapture::new(FrameRateCaptureOptions::default());
let _ = capture.start();
let snapshot = capture.snapshot();

if let Some(stable) = snapshot.stable_fps {
    println!("stable fps = {}", stable.fps);
}
```

Key exported types:

- `FrameRateCapture`
- `FrameRateSnapshot`
- `StableFps`
- `CaptureStatus`
- `FrameRateProvider`
- `TargetProcessSelector`

## Windows Provider

The Windows provider starts PresentMon Console and reads CSV output from stdout.
It filters Infinity Nikki by process name, preferring:

1. `X6Game-Win64-Shipping.exe`
2. `InfinityNikki.exe`

The application should bundle a PresentMon executable under a `presentmon`
resource directory, for example:

```text
presentmon/
  PresentMon-2.4.1-x64.exe
```

For development, the provider also checks:

1. `FrameRateCaptureOptions.presentmon_executable`
2. `PRESENTMON_PATH`
3. Additional search directories in `FrameRateCaptureOptions.presentmon_search_dirs`
4. `PATH`

If PresentMon is not found, the snapshot status becomes
`CaptureStatus::PresentMonMissing`.

## Stability Algorithm

The sampler stores recent frame intervals and converts them to FPS. A stable FPS
is emitted only when:

- the sample window has enough frames;
- sample FPS values are within a reasonable range;
- standard deviation divided by average FPS stays under the configured jitter
  threshold.

Applications should use `stable_fps.fps` to lock playback timing before a run,
then keep that timing unchanged until the next run.

## Notes

- PresentMon reads Windows frame presentation data. It is close to what tools
  like RTSS/MSI Afterburner use for real-time game FPS monitoring.
- Frame generation can make displayed FPS differ from game logic FPS. In those
  cases the app should keep manual FPS available.
- macOS v1 intentionally does not estimate FPS from screen capture, because
  screen changes are not the same as game logic frames and require screen
  recording permissions.
