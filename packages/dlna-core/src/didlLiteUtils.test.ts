import { describe, it, expect } from 'bun:test';
import { createSingleItemDidlLiteXml, parseDidlLite } from './didlLiteUtils';
import type { DidlLiteObject, Resource, DidlLiteContainer } from './types';


const didlLiteItems = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"
    xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"
    xmlns:dlna="urn:schemas-dlna-org:metadata-1-0/">
    <item id="%2F%D7%93%D7%95%D7%93%D7%95+%D7%A4%D7%99%D7%A9%D7%A8%2F01-%D7%91%D7%92%D7%9F+%D7%A9%D7%9C+%D7%93%D7%95%D7%93%D7%95+1.webm" parentID="%2F%D7%93%D7%95%D7%93%D7%95+%D7%A4%D7%99%D7%A9%D7%A8" restricted="1" searchable="0">
        <upnp:class>object.item.videoItem</upnp:class>
        <dc:title>01-בגן של דודו 1.webm</dc:title>
        <dc:date>2022-07-03</dc:date>
        <res protocolInfo="http-get:*:video/webm:DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000" size="78838431">http://localhost:7879/r/%D7%93%D7%95%D7%93%D7%95%20%D7%A4%D7%99%D7%A9%D7%A8/01-%D7%91%D7%92%D7%9F%20%D7%A9%D7%9C%20%D7%93%D7%95%D7%93%D7%95%201.webm</res>
    </item>
    <item id="%2F%D7%93%D7%95%D7%93%D7%95+%D7%A4%D7%99%D7%A9%D7%A8%2F02-%D7%91%D7%92%D7%9F+%D7%A9%D7%9C+%D7%93%D7%95%D7%93%D7%95+2.webm" parentID="%2F%D7%93%D7%95%D7%93%D7%95+%D7%A4%D7%99%D7%A9%D7%A8" restricted="1" searchable="0">
        <upnp:class>object.item.videoItem</upnp:class>
        <dc:title>02-בגן של דודו 2.webm</dc:title>
        <dc:date>2022-07-02</dc:date>
        <res protocolInfo="http-get:*:video/webm:DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000" size="81114066">http://localhost:7879/r/%D7%93%D7%95%D7%93%D7%95%20%D7%A4%D7%99%D7%A9%D7%A8/02-%D7%91%D7%92%D7%9F%20%D7%A9%D7%9C%20%D7%93%D7%95%D7%93%D7%95%202.webm</res>
    </item>
    <item id="%2F%D7%93%D7%95%D7%93%D7%95+%D7%A4%D7%99%D7%A9%D7%A8%2F03-%D7%91%D7%92%D7%9F+%D7%A9%D7%9C+%D7%93%D7%95%D7%93%D7%95+3.webm" parentID="%2F%D7%93%D7%95%D7%93%D7%95+%D7%A4%D7%99%D7%A9%D7%A8" restricted="1" searchable="0">
        <upnp:class>object.item.videoItem</upnp:class>
        <dc:title>03-בגן של דודו 3.webm</dc:title>
        <dc:date>2022-07-03</dc:date>
        <res protocolInfo="http-get:*:video/webm:DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000" size="97488074">http://localhost:7879/r/%D7%93%D7%95%D7%93%D7%95%20%D7%A4%D7%99%D7%A9%D7%A8/03-%D7%91%D7%92%D7%9F%20%D7%A9%D7%9C%20%D7%93%D7%95%D7%93%D7%95%203.webm</res>
    </item>
    <item id="%2F%D7%93%D7%95%D7%93%D7%95+%D7%A4%D7%99%D7%A9%D7%A8%2F04-%D7%91%D7%92%D7%9F+%D7%A9%D7%9C+%D7%93%D7%95%D7%93%D7%95+4.webm" parentID="%2F%D7%93%D7%95%D7%93%D7%95+%D7%A4%D7%99%D7%A9%D7%A8" restricted="1" searchable="0">
        <upnp:class>object.item.videoItem</upnp:class>
        <dc:title>04-בגן של דודו 4.webm</dc:title>
        <dc:date>2022-07-03</dc:date>
        <res protocolInfo="http-get:*:video/webm:DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000" size="88162619">http://localhost:7879/r/%D7%93%D7%95%D7%93%D7%95%20%D7%A4%D7%99%D7%A9%D7%A8/04-%D7%91%D7%92%D7%9F%20%D7%A9%D7%9C%20%D7%93%D7%95%D7%93%D7%95%204.webm</res>
    </item>
    <item id="%2F%D7%93%D7%95%D7%93%D7%95+%D7%A4%D7%99%D7%A9%D7%A8%2F07-%D7%A9%D7%91%D7%AA+%D7%A9%D7%9C%D7%95%D7%9D+7.webm" parentID="%2F%D7%93%D7%95%D7%93%D7%95+%D7%A4%D7%99%D7%A9%D7%A8" restricted="1" searchable="0">
        <upnp:class>object.item.videoItem</upnp:class>
        <dc:title>07-שבת שלום 7.webm</dc:title>
        <dc:date>2022-07-03</dc:date>
        <res protocolInfo="http-get:*:video/webm:DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000" size="103908045">http://localhost:7879/r/%D7%93%D7%95%D7%93%D7%95%20%D7%A4%D7%99%D7%A9%D7%A8/07-%D7%A9%D7%91%D7%AA%20%D7%A9%D7%9C%D7%95%D7%9D%207.webm</res>
    </item>
    <item id="%2F%D7%93%D7%95%D7%93%D7%95+%D7%A4%D7%99%D7%A9%D7%A8%2F%D7%91%D7%92%D7%9F+%D7%A9%D7%9C+%D7%93%D7%95%D7%93%D7%95+-+%D7%99%D7%A6%D7%99%D7%90%D7%AA+%D7%9E%D7%A6%D7%A8%D7%99%D7%9D+%D7%A2%D7%9D+%D7%93%D7%95%D7%93%D7%95+%D7%A4%D7%99%D7%A9%D7%A8.mpg" parentID="%2F%D7%93%D7%95%D7%93%D7%95+%D7%A4%D7%99%D7%A9%D7%A8" restricted="1" searchable="0">
        <upnp:class>object.item.videoItem</upnp:class>
        <dc:title>בגן של דודו - יציאת מצרים עם דודו פישר.mpg</dc:title>
        <dc:date>2022-07-08</dc:date>
        <res protocolInfo="http-get:*:video/mpeg:DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000" size="684707844">http://localhost:7879/r/%D7%93%D7%95%D7%93%D7%95%20%D7%A4%D7%99%D7%A9%D7%A8/%D7%91%D7%92%D7%9F%20%D7%A9%D7%9C%20%D7%93%D7%95%D7%93%D7%95%20-%20%D7%99%D7%A6%D7%99%D7%90%D7%AA%20%D7%9E%D7%A6%D7%A8%D7%99%D7%9D%20%D7%A2%D7%9D%20%D7%93%D7%95%D7%93%D7%95%20%D7%A4%D7%99%D7%A9%D7%A8.mpg</res>
    </item>
    <item id="%2F%D7%93%D7%95%D7%93%D7%95+%D7%A4%D7%99%D7%A9%D7%A8%2F%D7%91%D7%92%D7%9F+%D7%A9%D7%9C+%D7%93%D7%95%D7%93%D7%95+-+%D7%99%D7%A6%D7%99%D7%90%D7%AA+%D7%9E%D7%A6%D7%A8%D7%99%D7%9D+%D7%A2%D7%9D+%D7%93%D7%95%D7%93%D7%95+%D7%A4%D7%99%D7%A9%D7%A8.webm" parentID="%2F%D7%93%D7%95%D7%93%D7%95+%D7%A4%D7%99%D7%A9%D7%A8" restricted="1" searchable="0">
        <upnp:class>object.item.videoItem</upnp:class>
        <dc:title>בגן של דודו - יציאת מצרים עם דודו פישר.webm</dc:title>
        <dc:date>2022-11-11</dc:date>
        <res protocolInfo="http-get:*:video/webm:DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000" size="781707935">http://localhost:7879/r/%D7%93%D7%95%D7%93%D7%95%20%D7%A4%D7%99%D7%A9%D7%A8/%D7%91%D7%92%D7%9F%20%D7%A9%D7%9C%20%D7%93%D7%95%D7%93%D7%95%20-%20%D7%99%D7%A6%D7%99%D7%90%D7%AA%20%D7%9E%D7%A6%D7%A8%D7%99%D7%9D%20%D7%A2%D7%9D%20%D7%93%D7%95%D7%93%D7%95%20%D7%A4%D7%99%D7%A9%D7%A8.webm</res>
    </item>
    <item id="%2F%D7%93%D7%95%D7%93%D7%95+%D7%A4%D7%99%D7%A9%D7%A8%2F%D7%91%D7%92%D7%9F+%D7%A9%D7%9C+%D7%93%D7%95%D7%93%D7%95+18+-+%D7%91%D7%A8%D7%90%D7%A9%D7%99%D7%AA+%D7%97%D7%9C%D7%A7+%D7%90.avi" parentID="%2F%D7%93%D7%95%D7%93%D7%95+%D7%A4%D7%99%D7%A9%D7%A8" restricted="1" searchable="0">
        <upnp:class>object.item.videoItem</upnp:class>
        <dc:title>בגן של דודו 18 - בראשית חלק א.avi</dc:title>
        <dc:date>2024-05-02</dc:date>
        <res protocolInfo="http-get:*:video/x-msvideo:DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000" size="426830872">http://localhost:7879/r/%D7%93%D7%95%D7%93%D7%95%20%D7%A4%D7%99%D7%A9%D7%A8/%D7%91%D7%92%D7%9F%20%D7%A9%D7%9C%20%D7%93%D7%95%D7%93%D7%95%2018%20-%20%D7%91%D7%A8%D7%90%D7%A9%D7%99%D7%AA%20%D7%97%D7%9C%D7%A7%20%D7%90.avi</res>
    </item>
    <item id="%2F%D7%93%D7%95%D7%93%D7%95+%D7%A4%D7%99%D7%A9%D7%A8%2F%D7%91%D7%92%D7%9F+%D7%A9%D7%9C+%D7%93%D7%95%D7%93%D7%95+19+-+%D7%91%D7%A8%D7%90%D7%A9%D7%99%D7%AA+%D7%97%D7%9C%D7%A7+%D7%91.avi" parentID="%2F%D7%93%D7%95%D7%93%D7%95+%D7%A4%D7%99%D7%A9%D7%A8" restricted="1" searchable="0">
        <upnp:class>object.item.videoItem</upnp:class>
        <dc:title>בגן של דודו 19 - בראשית חלק ב.avi</dc:title>
        <dc:date>2022-06-24</dc:date>
        <res protocolInfo="http-get:*:video/x-msvideo:DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000" size="484011794">http://localhost:7879/r/%D7%93%D7%95%D7%93%D7%95%20%D7%A4%D7%99%D7%A9%D7%A8/%D7%91%D7%92%D7%9F%20%D7%A9%D7%9C%20%D7%93%D7%95%D7%93%D7%95%2019%20-%20%D7%91%D7%A8%D7%90%D7%A9%D7%99%D7%AA%20%D7%97%D7%9C%D7%A7%20%D7%91.avi</res>
    </item>
    <item id="%2F%D7%93%D7%95%D7%93%D7%95+%D7%A4%D7%99%D7%A9%D7%A8%2F%D7%91%D7%A8%D7%90%D7%A9%D7%99%D7%AA+%D7%97%D7%9C%D7%A7+%D7%90.mp4" parentID="%2F%D7%93%D7%95%D7%93%D7%95+%D7%A4%D7%99%D7%A9%D7%A8" restricted="1" searchable="0">
        <upnp:class>object.item.videoItem</upnp:class>
        <dc:title>בראשית חלק א.mp4</dc:title>
        <dc:date>2022-11-12</dc:date>
        <res protocolInfo="http-get:*:video/mp4:DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000" size="627181537">http://localhost:7879/r/%D7%93%D7%95%D7%93%D7%95%20%D7%A4%D7%99%D7%A9%D7%A8/%D7%91%D7%A8%D7%90%D7%A9%D7%99%D7%AA%20%D7%97%D7%9C%D7%A7%20%D7%90.mp4</res>
    </item>
    <item id="%2F%D7%93%D7%95%D7%93%D7%95+%D7%A4%D7%99%D7%A9%D7%A8%2F%D7%97%D7%A0%D7%95%D7%9B%D7%94.mp4" parentID="%2F%D7%93%D7%95%D7%93%D7%95+%D7%A4%D7%99%D7%A9%D7%A8" restricted="1" searchable="0">
        <upnp:class>object.item.videoItem</upnp:class>
        <dc:title>חנוכה.mp4</dc:title>
        <dc:date>2024-05-02</dc:date>
        <res protocolInfo="http-get:*:video/mp4:DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000" size="133896146">http://localhost:7879/r/%D7%93%D7%95%D7%93%D7%95%20%D7%A4%D7%99%D7%A9%D7%A8/%D7%97%D7%A0%D7%95%D7%9B%D7%94.mp4</res>
    </item>
    <item id="%2F%D7%93%D7%95%D7%93%D7%95+%D7%A4%D7%99%D7%A9%D7%A8%2F%D7%A0%D7%A9%D7%9E%D7%95%D7%A8+%D7%A2%D7%9C+%D7%94%D7%A2%D7%95%D7%9C%D7%9D+%D7%9E%D7%AA%D7%95%D7%9A+%D7%91%D7%92%D7%9F+%D7%A9%D7%9C+%D7%93%D7%95%D7%93%D7%95+15-%D7%A9%D7%99%D7%A8%D7%AA+%D7%94%D7%97%D7%99%D7%95%D7%AA+DUDU+FISHER.mp4" parentID="%2F%D7%93%D7%95%D7%93%D7%95+%D7%A4%D7%99%D7%A9%D7%A8" restricted="1" searchable="0">
        <upnp:class>object.item.videoItem</upnp:class>
        <dc:title>נשמור על העולם מתוך בגן של דודו 15-שירת החיות DUDU FISHER.mp4</dc:title>
        <dc:date>2024-02-05</dc:date>
        <res 
        protocolInfo="http-get:*:video/mp4:DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000" size="13379891">http://localhost:7879/r/%D7%93%D7%95%D7%93%D7%95%20%D7%A4%D7%99%D7%A9%D7%A8/%D7%A0%D7%A9%D7%9E%D7%95%D7%A8%20%D7%A2%D7%9C%20%D7%94%D7%A2%D7%95%D7%9C%D7%9D%20%D7%9E%D7%AA%D7%95%D7%9A%20%D7%91%D7%92%D7%9F%20%D7%A9%D7%9C%20%D7%93%D7%95%D7%93%D7%95%2015-%D7%A9%D7%99%D7%A8%D7%AA%20%D7%94%D7%97%D7%99%D7%95%D7%AA%20DUDU%20FISHER.mp4</res>
    </item>
</DIDL-Lite>`;

describe('didlLiteUtils', () => {

  describe('createSingleItemDidlLiteXml', () => {
    it('should create a valid DIDL-Lite XML for a video item', () => {
      const item: DidlLiteObject = {
        id: 'video1',
        parentId: '0',
        title: 'My Movie',
        class: 'object.item.videoItem',
        restricted: false,
        resources: [], // Not used by createSingleItemDidlLiteXml directly
      };
      const resource: Resource = {
        uri: 'http://example.com/movie.mp4',
        protocolInfo: 'http-get:*:video/mp4:*',
        size: 12345678,
        duration: '01:23:45.000',
      };

      const xml = createSingleItemDidlLiteXml(item, resource);

      // We check for key elements and attributes to be present.
      // A full XML validation is possible but more complex for a unit test.
      expect(xml).toContain('<DIDL-Lite');
      expect(xml).toContain('<item id="video1" parentID="0" restricted="0">');
      expect(xml).toContain('<dc:title>My Movie</dc:title>');
      expect(xml).toContain('<upnp:class>object.item.videoItem</upnp:class>');
      expect(xml).toContain('<res protocolInfo="http-get:*:video/mp4:*" size="12345678" duration="01:23:45.000">');
      expect(xml).toContain('http://example.com/movie.mp4</res>');
    });

    it('should handle items with minimal properties', () => {
        const item: DidlLiteObject = {
            id: 'item2',
            parentId: '-1',
            title: 'Minimal',
            class: 'object.item',
            restricted: true,
            resources: [],
        };
        const resource: Resource = {
            uri: 'http://a.b/c',
            protocolInfo: 'http-get:*:*:*',
        };

        const xml = createSingleItemDidlLiteXml(item, resource);
        expect(xml).toContain('<item id="item2" parentID="-1" restricted="1">');
        expect(xml).toContain('<dc:title>Minimal</dc:title>');
        expect(xml).toContain('<res protocolInfo="http-get:*:*:*">http://a.b/c</res>');
        expect(xml).not.toContain('size=');
        expect(xml).not.toContain('duration=');
    });
  });

  describe('parseDidlLite', () => {
    it('should parse a DIDL-Lite string with a single item', async () => {
      const xmlString = `
        <DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">
          <item id="100" parentID="10" restricted="1">
            <dc:title>My Test Video</dc:title>
            <upnp:class>object.item.videoItem</upnp:class>
            <upnp:artist>An Artist</upnp:artist>
            <res protocolInfo="http-get:*:video/mpeg:*" size="12345" duration="00:05:00.123">http://server/video.mpg</res>
          </item>
        </DIDL-Lite>
      `;
      const { items } = await parseDidlLite(xmlString);
      expect(items).toHaveLength(1);
      const parsedItem = items[0] as DidlLiteObject;
      expect(parsedItem.id).toBe('100');
      expect(parsedItem.parentId).toBe('10');
      expect(parsedItem.restricted).toBe(true);
      expect(parsedItem.title).toBe('My Test Video');
      expect(parsedItem.class).toBe('object.item.videoItem');
      expect(parsedItem.artist).toBe('An Artist');
      expect(parsedItem.resources).toBeArray();
      expect(parsedItem.resources).toHaveLength(1);

      // Add a check to ensure resources array is not empty before accessing its elements
      if (parsedItem.resources && parsedItem.resources.length > 0) {

        const resource = parsedItem.resources[0];

        expect(resource.uri).toBe('http://server/video.mpg');
        expect(resource.protocolInfo).toBe('http-get:*:video/mpeg:*');
        expect(resource.size).toBe(12345);
        expect(resource.duration).toBe('00:05:00.123');
      }
    });

    it('should parse a DIDL-Lite string with a container', async () => {
        const xmlString = `
          <DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">
            <container id="20" parentID="2" restricted="0" childCount="5" searchable="1">
              <dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">My Music</dc:title>
              <upnp:class xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">object.container.album.musicAlbum</upnp:class>
            </container>
          </DIDL-Lite>
        `;
        const { items } = await parseDidlLite(xmlString);
        expect(items).toHaveLength(1);
        const parsedContainer = items[0] as DidlLiteContainer;
        expect(parsedContainer.id).toBe('20');
        expect(parsedContainer.parentId).toBe('2');
        expect(parsedContainer.title).toBe('My Music');
        expect(parsedContainer.class).toBe('object.container.album.musicAlbum');
        expect(parsedContainer.childCount).toBe(5);
        expect(parsedContainer.searchable).toBe(true);
    });

    it('should parse multiple items and containers', async () => {
        const xmlString = `
          <DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">
            <container id="1" parentID="0">
              <dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">Folder 1</dc:title>
            </container>
            <item id="2" parentID="1"><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">Item 1</dc:title></item>
            <item id="3" parentID="1"><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">Item 2</dc:title></item>
          </DIDL-Lite>
        `;
        const parseItem = await parseDidlLite(xmlString);
        expect(parseItem.items).toHaveLength(3);
        expect(parseItem.items[0].id).toBe('1');
        expect(parseItem.items[1].id).toBe('2');
        expect(parseItem.items[2].id).toBe('3');
    });

    it('should return an empty array for an empty DIDL-Lite string', async () => {
        const xmlString = `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"></DIDL-Lite>`;
        const { items } = await parseDidlLite(xmlString);
        expect(items).toBeArray();
        expect(items).toBeEmpty();
    });

    it('should throw an error for invalid XML', async () => {
        const xmlString = `<DIDL-Lite><item>...<item></DIDL-Lite>`;
        // Using expect().toThrow() with async functions requires a wrapper.
        await expect(() => parseDidlLite(xmlString)).toThrow();
    });

    it('should correctly parse all parameters from the rclone DIDL-Lite XML', async () => {
      const { items } = await parseDidlLite(didlLiteItems);

      expect(items).toHaveLength(12);
      const firstItem = items[0] as DidlLiteObject;

      // --- בדיקות מקיפות לפריט הראשון ---
      expect(decodeURIComponent(firstItem.id)).toBe('/דודו+פישר/01-בגן+של+דודו+1.webm');
      expect(decodeURIComponent(firstItem.parentId)).toBe('/דודו+פישר');
      expect(firstItem.restricted).toBe(true);
      expect(firstItem.title).toBe('01-בגן של דודו 1.webm');
      expect(firstItem.class).toBe('object.item.videoItem');
      expect(firstItem.date).toBe('2022-07-03');
      
      // --- בדיקות מקיפות למשאבים ---
      expect(firstItem.resources).toBeArray();
      expect(firstItem.resources).toHaveLength(1);

      if (firstItem.resources && firstItem.resources.length > 0) {
        const resource = firstItem.resources[0];
        expect(resource.size).toBe(78838431);
        expect(decodeURIComponent(resource.uri)).toBe('http://localhost:7879/r/דודו פישר/01-בגן של דודו 1.webm');
        expect(resource.protocolInfo).toBe('http-get:*:video/webm:DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000');

        // --- בדיקות מקיפות ל-protocolInfo המפוענח ---
        const ppi = resource.parsedProtocolInfo;
        expect(ppi).toBeDefined();
        expect(ppi?.protocol).toBe('http-get');
        expect(ppi?.network).toBe('*');
        expect(ppi?.contentFormat).toBe('video/webm');
        
        const dlna = ppi?.dlnaParameters;
        expect(dlna).toBeDefined();
        expect(dlna?.rawDlnaParams['DLNA.ORG_OP']).toBe('01');
        expect(dlna?.rawDlnaParams['DLNA.ORG_CI']).toBe('0');
        expect(dlna?.rawDlnaParams['DLNA.ORG_FLAGS']).toBe('01700000000000000000000000000000');

        expect(dlna?.operation?.timeSeekSupported).toBe(true);
        expect(dlna?.operation?.rangeSeekSupported).toBe(false);
        expect(dlna?.conversionIndication).toBe('original');
        
        const flags = dlna?.flags;
        expect(flags).toBeDefined();
        expect(flags?.dlnaV1_5).toBe(true);
        expect(flags?.senderPaced).toBe(false);
        expect(flags?.timeBasedSeek).toBe(false);
        expect(flags?.byteBasedSeek).toBe(false);
        expect(flags?.playContainer).toBe(true);
        expect(flags?.interactive).toBe(true);
        expect(flags?.s0Increasing).toBe(false);
      }
    });

    it('should correctly parse protocolInfo from rclone XML', async () => {
      const { items } = await parseDidlLite(didlLiteItems);
      const firstItem = items[0] as DidlLiteObject;
      
      expect(firstItem.resources).toBeDefined();
      expect(firstItem.resources).not.toBeEmpty();

      if (firstItem.resources && firstItem.resources.length > 0) {
        const resource = firstItem.resources[0];
        expect(resource.parsedProtocolInfo).toBeDefined();
        
        const ppi = resource.parsedProtocolInfo;
        expect(ppi?.protocol).toBe('http-get');
        expect(ppi?.network).toBe('*');
        expect(ppi?.contentFormat).toBe('video/webm');
        expect(ppi?.dlnaParameters).toBeInstanceOf(Object);
        const dlnaParameters = ppi?.dlnaParameters;

        expect(dlnaParameters!.conversionIndication).toBe('original');
        expect(dlnaParameters!.operation!.timeSeekSupported ).toBe(true);
        expect(dlnaParameters!.conversionIndication).toBe('original');
        expect(dlnaParameters!.rawDlnaParams['DLNA.ORG_OP']).toBe('01');
        expect(dlnaParameters!.rawDlnaParams['DLNA.ORG_CI']).toBe('0');
        expect(dlnaParameters!.rawDlnaParams['DLNA.ORG_FLAGS']).toBe('01700000000000000000000000000000');

        // בדיקת הדגלים המפורסרים
        const parsedFlags = dlnaParameters?.flags;
        expect(parsedFlags).toBeDefined();
        expect(parsedFlags!.senderPaced).toBe(false);
        expect(parsedFlags!.timeBasedSeek).toBe(false);
        expect(parsedFlags!.byteBasedSeek).toBe(false);
        expect(parsedFlags!.dlnaV1_5).toBe(true);
      }
    });
    it('should handle an item with multiple resources', async () => {
      const xmlString = `
        <DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/">
          <item id="1">
            <dc:title>Multi-res Item</dc:title>
            <res protocolInfo="http-get:*:video/mp4:*">http://server/video.mp4</res>
            <res protocolInfo="http-get:*:video/webm:*">http://server/video.webm</res>
          </item>
        </DIDL-Lite>
      `;
      const { items } = await parseDidlLite(xmlString);
      expect(items).toHaveLength(1);
      const parsedItem = items[0] as DidlLiteObject;
      expect(parsedItem.resources).toHaveLength(2);
      if (parsedItem.resources) {
        expect(parsedItem.resources[0].uri).toBe('http://server/video.mp4');
        expect(parsedItem.resources[1].uri).toBe('http://server/video.webm');
      }
    });

    it('should correctly parse originalTrackNumber', async () => {
      const xmlString = `
        <DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:dc="http://purl.org/dc/elements/1.1/">
          <item id="1">
            <dc:title>Track</dc:title>
            <upnp:originalTrackNumber>5</upnp:originalTrackNumber>
          </item>
        </DIDL-Lite>
      `;
      const { items } = await parseDidlLite(xmlString);
      expect(items).toHaveLength(1);
      const parsedItem = items[0] as DidlLiteObject;
      expect(parsedItem.originalTrackNumber).toBe(5);
    });

    it('should handle item without resources', async () => {
        const xmlString = `
        <DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/">
          <item id="1">
            <dc:title>No Resource</dc:title>
          </item>
        </DIDL-Lite>
      `;
      const { items } = await parseDidlLite(xmlString);
      expect(items).toHaveLength(1);
      const parsedItem = items[0] as DidlLiteObject;
      expect(parsedItem.resources).toBeArray();
      expect(parsedItem.resources).toBeEmpty();
    });

    it('should map unhandled attributes and elements', async () => {
      const xmlString = `
        <DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:custom="http://my.custom.namespace/" xmlns:dc="http://purl.org/dc/elements/1.1/">
          <item id="1" custom:myAttr="customValue">
            <dc:title>Custom Item</dc:title>
            <custom:myElement>custom text</custom:myElement>
          </item>
        </DIDL-Lite>
      `;
      const { items } = await parseDidlLite(xmlString);
      expect(items).toHaveLength(1);
      const parsedItem = items[0] as DidlLiteObject;
      
      // The library lowercases attribute names that have namespaces
      expect(parsedItem['custom:myAttr' as keyof DidlLiteObject]).toBe('customValue');
      expect(parsedItem['custom:myElement' as keyof DidlLiteObject]).toBe('custom text');
    });
  });
});