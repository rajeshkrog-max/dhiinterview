@echo off
rem Dhirise Mind Mirror: always serve on port 8081 so saved sessions stay in the same browser storage.
rem (Port 8080 is used by the Sera project.)
cd /d "%~dp0"
start "" http://localhost:8081
python -m http.server 8081 || py -m http.server 8081
