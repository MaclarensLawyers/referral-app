@echo off
REM Quick commit with interactive commit message prompt

echo.
echo ====================================
echo  Quick Commit and Push
echo ====================================
echo.

set /p COMMIT_MESSAGE="Enter commit message: "

if "%COMMIT_MESSAGE%"=="" (
    echo ERROR: Commit message cannot be empty
    echo.
    pause
    exit /b 1
)

call commit-and-push.bat "%COMMIT_MESSAGE%"
