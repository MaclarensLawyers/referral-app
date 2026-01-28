@echo off
setlocal enabledelayedexpansion
REM Automated commit and push workflow
REM This script:
REM 1. Restores Auth0 placeholders
REM 2. Commits and pushes changes
REM 3. Re-injects Auth0 config for local dev

echo.
echo ====================================
echo  Automated Git Commit and Push
echo ====================================
echo.

REM Check if commit message was provided as parameter, otherwise prompt
if "%~1"=="" (
    set /p COMMIT_MESSAGE="Enter commit message: "

    if "!COMMIT_MESSAGE!"=="" (
        echo ERROR: Commit message cannot be empty
        echo.
        pause
        exit /b 1
    )
) else (
    set COMMIT_MESSAGE=%~1
)

echo [1/5] Restoring Auth0 placeholders...
node restore-placeholders.js
if errorlevel 1 (
    echo ERROR: Failed to restore placeholders
    pause
    exit /b 1
)

echo.
echo [2/5] Staging files for commit...
git add .
if errorlevel 1 (
    echo ERROR: Failed to stage files
    pause
    exit /b 1
)

echo.
echo [3/5] Creating commit...
git commit -m "%COMMIT_MESSAGE%"
if errorlevel 1 (
    echo ERROR: Failed to create commit
    pause
    exit /b 1
)

echo.
echo [4/5] Pushing to remote...
git push
if errorlevel 1 (
    echo ERROR: Failed to push
    pause
    exit /b 1
)

echo.
echo [5/5] Re-injecting Auth0 config for local dev...
node inject-auth0.js
if errorlevel 1 (
    echo WARNING: Failed to re-inject Auth0 config
)

echo.
echo ====================================
echo  SUCCESS! All changes pushed
echo ====================================
echo.
echo Your local dev server is ready to continue working.
echo.
pause
