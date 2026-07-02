@echo off
cls
title Pool Verifier

:menu
cls
echo =====================================
echo.
echo   NiceHash Pool Auto-Verifier
echo.
echo =====================================
echo.
echo Select an option to run the verifier:
echo.
echo  1. Verify ALL clients (BT, PH, LN, NHATLINH)
echo  2. Verify BT only
echo  3. Verify PH only
echo  4. Verify LN only
echo  5. Verify NHATLINH only
echo  6. Enter custom client list (e.g., PH,BT)
echo.
echo  Q. Quit
echo.

set /p choice="Enter your choice: "

if /i "%choice%"=="1" set CLIENTS=BT,PH,LN,NHATLINH
if /i "%choice%"=="2" set CLIENTS=BT
if /i "%choice%"=="3" set CLIENTS=PH
if /i "%choice%"=="4" set CLIENTS=LN
if /i "%choice%"=="5" set CLIENTS=NHATLINH
if /i "%choice%"=="6" goto custom
if /i "%choice%"=="q" goto end

if not defined CLIENTS (
    echo Invalid choice. Please try again.
    pause
    goto menu
)

goto run

:custom
cls
echo =====================================
echo  Enter Custom Client List
echo =====================================
echo.
echo Example: PH,BT,LN
echo.
set /p CLIENTS="Enter clients (comma-separated): "
if not defined CLIENTS (
    echo No clients entered. Returning to menu.
    pause
    goto menu
)
goto run

:run
cls
echo Starting verifier for client(s): %CLIENTS%
echo.
echo Press Ctrl+C to stop the script.
echo.

rem Run the verifier with default loop settings
node server/verify-all-accounts.js --client=%CLIENTS% --loops=0 --verbose --interval=30 --delay=2500

echo.
echo Script finished.
pause

:end
exit