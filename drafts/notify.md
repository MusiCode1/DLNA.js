

```http
NOTIFY * HTTP/1.1
HOST: 239.255.255.250:1900
NT: urn:microsoft.com:service:X_MS_MediaReceiverRegistrar:1
NTS: ssdp:alive
SERVER: Linux/3.4 DLNADOC/1.50 UPnP/1.0 DMS/1.0
USN: uuid:9c219fd1-b9e5-637b-480c-88bf4eb39ed4::urn:microsoft.com:service:X_MS_MediaReceiverRegistrar:1
CACHE-CONTROL: max-age=25
LOCATION: http://10.100.102.106:7879/rootDesc.xml
```

```
HTTP/1.1 200 OK
ST: urn:schemas-upnp-org:service:ConnectionManager:1
USN: uuid:e2dde756-23aa-4d07-9804-42e5bc91e58c::urn:schemas-upnp-org:service:ConnectionManager:1
Location: http://192.168.1.108:2869/upnphost/udhisapi.dll?content=uuid:e2dde756-23aa-4d07-9804-42e5bc91e58c
OPT:"http://schemas.upnp.org/upnp/1/0/"; ns=01
01-NLS: 6b166944468fd3aacf466f04ae3e170d
Cache-Control: max-age=900
Server: Microsoft-Windows/10.0 UPnP/1.0 UPnP-Device-Host/1.0
Ext: 
Date: Wed, 21 May 2025 02:16:34 GMT
```