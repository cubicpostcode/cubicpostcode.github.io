@echo off

REM Check Windows version
ver | findstr /i "10." >nul
if %errorlevel%==0 (
    set WIN_VERSION=10
) else (
    ver | findstr /i "11." >nul
    if %errorlevel%==0 (
        set WIN_VERSION=11
    ) else (
        set WIN_VERSION=Other
    )
)

REM Set default opening page for browsers based on Windows version
if "%WIN_VERSION%"=="10" (
    REG ADD "HKEY_CURRENT_USER\Software\Microsoft\Internet Explorer\Main" /v "Start Page" /d "https://www.bing.com" /f
    REG ADD "HKEY_CURRENT_USER\Software\Microsoft\Edge\Main" /v "Start Page" /d "https://www.bing.com" /f
    REG ADD "HKEY_CURRENT_USER\Software\Microsoft\Edge\BLBeacon" /v "Start Page" /d "https://www.bing.com" /f
    REG ADD "HKEY_CURRENT_USER\Software\Google\Chrome\PreferenceMACs\Default\homepage" /v "homepage" /t REG_SZ /d "https://www.bing.com" /f
) else if "%WIN_VERSION%"=="11" (
    REG ADD "HKEY_CURRENT_USER\Software\Microsoft\Internet Explorer\Main" /v "Start Page" /d "https://www.bing.com" /f
    REG ADD "HKEY_CURRENT_USER\Software\Microsoft\Edge\Main" /v "Start Page" /d "https://www.bing.com" /f
    REG ADD "HKEY_CURRENT_USER\Software\Microsoft\Edge\BLBeacon" /v "Start Page" /d "https://www.bing.com" /f
    REG ADD "HKEY_CURRENT_USER\Software\Google\Chrome\PreferenceMACs\Default\homepage" /v "homepage" /t REG_SZ /d "https://www.bing.com" /f
    REG ADD "HKEY_CURRENT_USER\Software\Google\Chrome\PreferenceMACs\Default\URLsToRestoreOnStartup\1" /ve /d "https://www.bing.com" /f
) else (
    echo Unsupported Windows version.
    pause
    exit /b
)

echo Default opening page set to "bing.com" for installed browsers.
pause
