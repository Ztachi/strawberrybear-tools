# PresentMon resource directory

Windows automatic FPS capture looks for a `PresentMon*.exe` file in this
directory after the app is bundled.

The runtime also checks `PRESENTMON_PATH` and `PATH`, so development builds can
use a locally installed PresentMon without committing the executable.

Recommended source: <https://github.com/GameTechDev/PresentMon/releases>
