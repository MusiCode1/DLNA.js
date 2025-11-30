
bun build .\server\index.ts --compile --minify --sourcemap --bytecode --windows-hide-console --outfile .\dist\dlna-server

bun build .\server\index.ts --compile --minify --outfile .\dist\dlna-server
# ESP32

```tasmota
WebQuery http://www.mysite.com/api/status GET
WebQuery http://192.168.1.117:5544/play GET
WebQuery http://192.168.1.50:3300/api/play-preset/moishy-tv GET

ON <trigger> DO <command> [ENDON | BREAK]

# not worked
Rule1 ON Button1#state=1 DO WebSend [192.168.1.102:3300] /api/play-preset?presetName=Moishy ENDON 

Rule1 ON Button1#state=12 DO WebSend [192.168.1.102:3300] /api/play-preset?presetName=Moishy ENDON 

Rule1 ON Button1#state=2 DO WebQuery http://192.168.1.50:3300/api/play-preset/moishy-tv GET ENDON 


https://v6vbmfkm-3300.euw.devtunnels.ms/api/play-preset/moishy-tv

Rule1 ON Button1#state=2 DO WebQuery https://v6vbmfkm-3300.euw.devtunnels.ms/api/play-preset/moishy-tv GET ENDON 

WebSend [myserver.com] /fancy/data.php?log=1234

WebSend [192.168.1.102:3300] /api/play-preset/Moishy

Template {"NAME":"Seeed Studio XIAO ESP32C6","GPIO":[1,1,1,1,0,0,1,1,0,0,1,1,1,1,1,320,3200,3232,704,736,672,768,640,608,0,0,0,0,0,0,0],"FLAG":0,"BASE":1}

Template {"NAME":"Seeed Studio XIAO ESP32C6","GPIO":[1,1,1,1,0,0,1,1,0,0,1,1,1,1,1,320,3200,3232,1,736,1,768,640,608,0,0,0,0,0,0,0],"FLAG":0,"BASE":1}

Backlog Ssid1 MakeLab-guest2; Password1 20182018; Template {"NAME":"Seeed Studio XIAO ESP32C6","GPIO":[1,1,1,1,0,0,1,1,0,0,1,1,1,1,1,320,3200,3232,1,736,1,768,640,608,0,0,0,0,0,0,0],"FLAG":0,"BASE":1}; Gpio18 18; Gpio20 18;

BackLog Gpio18 18; Gpio20 18;

Backlog Ssid1 HALNy-2.4G-01a2a1; Password1 wftWZZfc59;
Backlog Ssid1 smart-home; Password1 4y48q4686l6ayh;

Weblog 4
SerialLog 4
SetOption13 1

WifiScan 1


```

```json
{"NAME":"Seeed Studio XIAO ESP32C6","GPIO":[1,1,1,1,0,0,1,1,0,0,1,1,1,1,1,320,3200,3232,1,736,1,768,640,608,0,0,0,0,0,0,0],"FLAG":0,"BASE":1}
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