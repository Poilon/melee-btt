@echo off
cd /d "%~dp0"
echo TTRC Companion
echo Keep this window open while playing. Your browser will open automatically.
"%~dp0runtime\node\node.exe" "%~dp0desktop\start.mjs"
if errorlevel 1 (
  echo.
  echo The companion could not start. Extract the entire ZIP into a writable folder and try again.
  pause
)
