
bun build .\server\index.ts --compile --minify --sourcemap --bytecode --windows-hide-console --outfile .\dist\dlna-server

bun build .\server\index.ts --compile --minify --outfile .\dist\dlna-server
# ESP32

```tasmota
WebQuery http://www.mysite.com/api/status GET
WebQuery http://192.168.1.117:5544/play GET

ON <trigger> DO <command> [ENDON | BREAK]

# not worked
Rule1 ON Button1#state=1 DO WebSend [192.168.1.102:3300] /api/play-preset?presetName=Moishy ENDON 

Rule1 ON Button1#state=12 DO WebSend [192.168.1.102:3300] /api/play-preset?presetName=Moishy ENDON 

Rule1 ON Button1#state=2 DO WebQuery http://192.168.1.102:3300/api/play-preset/Moishy GET ENDON 


https://v6vbmfkm-3300.euw.devtunnels.ms/api/play-preset/moishy-tv

Rule1 ON Button1#state=2 DO WebQuery https://v6vbmfkm-3300.euw.devtunnels.ms/api/play-preset/moishy-tv GET ENDON 

WebSend [myserver.com] /fancy/data.php?log=1234

WebSend [192.168.1.102:3300] /api/play-preset/Moishy

```

# RClone

```powershell
rclone.exe serve dlna gDriveTzlev:"סרטוני זמן פנאי" `
    --read-only `
    --vfs-cache-mode full  `
    --cache-dir "D:\Users\User\.cache\rclone\"  `
    --name "סרטונים מגוגל דרייב"   `
    --rc  `
    --rc-no-auth  `
    --rc-web-gui  `
    --rc-addr :5572  `
    --log-level DEBUG  `
    --announce-interval 10s
```


```powershell
rclone.exe serve dlna gDriveTzlev:"סרטוני זמן פנאי" `
    --read-only `
    --name "סרטונים מגוגל דרייב"   `
    --log-level DEBUG  `
    --announce-interval 10s
```

--cache-dir 
--config D:\ProgramsAndApps\rclone\rclone.conf
--fast-list