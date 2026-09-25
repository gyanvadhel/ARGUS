# Starts the ARGUS scanning API and the web app in two windows.
$root = $PSScriptRoot
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\api'; .\.venv\Scripts\python -m uvicorn argus_api.main:app --reload --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\web'; npm run dev"
Write-Host "API  -> http://127.0.0.1:8000/health"
Write-Host "Web  -> http://localhost:3000"
