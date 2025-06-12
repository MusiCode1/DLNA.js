# הסרת תיקיות node_modules ו-dist מחבילות
Get-ChildItem -Path ./packages -Recurse -Include "node_modules", "dist" -Directory | ForEach-Object {
    Write-Host "Removing $($_.FullName)..."
    Remove-Item -Recurse -Force $_.FullName
}

# הסרת קבצי tsbuildinfo
Get-ChildItem -Path . -Recurse -Include "*.tsbuildinfo" | ForEach-Object {
    Write-Host "Removing $($_.FullName)..."
    Remove-Item -Recurse -Force $_.FullName
}

# הסרת תיקיית node_modules ראשית
if (Test-Path -Path ./node_modules) {
    Write-Host "Removing root node_modules..."
    Remove-Item -Recurse -Force -Path ./node_modules
}

Write-Host "Clean-up complete."