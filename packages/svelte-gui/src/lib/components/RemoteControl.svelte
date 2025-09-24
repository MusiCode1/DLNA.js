<script lang="ts">
  import { invokeAction } from '$lib/api';
  import { onMount } from 'svelte';

  let { udn }: { udn: string } = $props();

  // --- Reactive State ---
  let transportState = $state('STOPPED');
  let positionInfo = $state<any>({});
  let volume = $state(50);
  let isMuted = $state(false);
  let trackInfo = $state({
    title: 'Nothing Playing',
    artist: '',
    album: '',
    albumArtURI: ''
  });

  // --- Polling Logic ---
  let pollingInterval: number;

  async function pollStatus() {
    try {
      const transportInfoRes = await invokeAction(udn, 'AVTransport', 'GetTransportInfo', { InstanceID: '0' });
      if (transportInfoRes?.data && typeof transportInfoRes.data === 'object' && 'CurrentTransportState' in transportInfoRes.data) {
        transportState = transportInfoRes.data.CurrentTransportState as string;
      }

      const positionInfoRes = await invokeAction(udn, 'AVTransport', 'GetPositionInfo', { InstanceID: '0' });
      if (positionInfoRes?.data) {
          positionInfo = positionInfoRes.data;
          const meta = positionInfo.TrackMetaData;
          if (meta && typeof meta === 'string' && meta.includes('<dc:title>')) {
            trackInfo.title = meta.match(/<dc:title>(.*?)<\/dc:title>/)?.[1] || 'Unknown Title';
            trackInfo.artist = meta.match(/<upnp:artist>(.*?)<\/upnp:artist>/)?.[1] || '';
            trackInfo.album = meta.match(/<upnp:album>(.*?)<\/upnp:album>/)?.[1] || '';
            trackInfo.albumArtURI = meta.match(/<upnp:albumArtURI>(.*?)<\/upnp:albumArtURI>/)?.[1] || '';
          }
      }

      const volumeRes = await invokeAction(udn, 'RenderingControl', 'GetVolume', { InstanceID: '0', Channel: 'Master' });
      if (volumeRes?.data && typeof volumeRes.data === 'object' && 'CurrentVolume' in volumeRes.data) {
        volume = parseInt(volumeRes.data.CurrentVolume as string, 10);
      }

      const muteRes = await invokeAction(udn, 'RenderingControl', 'GetMute', { InstanceID: '0', Channel: 'Master' });
       if (muteRes?.data && typeof muteRes.data === 'object' && 'CurrentMute' in muteRes.data) {
        const currentMute = muteRes.data.CurrentMute;
        isMuted = currentMute === '1' || currentMute === true;
      }

    } catch (error) {
      console.error("Failed to poll status:", error);
    }
  }

  onMount(() => {
    pollStatus(); // Initial poll
    pollingInterval = window.setInterval(pollStatus, 2000);
    return () => window.clearInterval(pollingInterval);
  });

  // --- Control Functions ---
  function play() {
    invokeAction(udn, 'AVTransport', 'Play', { InstanceID: '0', Speed: '1' }).then(pollStatus);
  }
  function pause() {
    invokeAction(udn, 'AVTransport', 'Pause', { InstanceID: '0' }).then(pollStatus);
  }
  function stop() {
    invokeAction(udn, 'AVTransport', 'Stop', { InstanceID: '0' }).then(pollStatus);
  }
  function next() {
    invokeAction(udn, 'AVTransport', 'Next', { InstanceID: '0' }).then(pollStatus);
  }
  function previous() {
    invokeAction(udn, 'AVTransport', 'Previous', { InstanceID: '0' }).then(pollStatus);
  }
  function handleVolumeInput(event: Event) {
    const newVolume = (event.target as HTMLInputElement).value;
    volume = parseInt(newVolume, 10);
    invokeAction(udn, 'RenderingControl', 'SetVolume', { InstanceID: '0', Channel: 'Master', DesiredVolume: newVolume });
  }
  function toggleMute() {
    invokeAction(udn, 'RenderingControl', 'SetMute', { InstanceID: '0', Channel: 'Master', DesiredMute: !isMuted ? '1' : '0' }).then(pollStatus);
  }

</script>

<div class="bg-gray-800 rounded-lg shadow-md p-6 max-w-sm mx-auto">
  <div class="flex flex-col items-center gap-4">
    {#if trackInfo.albumArtURI}
      <img src={trackInfo.albumArtURI} alt="Album Art" class="w-48 h-48 rounded-md shadow-lg" />
    {/if}
    <div class="text-center">
      <h2 class="font-bold text-xl text-gray-100">{trackInfo.title}</h2>
      <p class="text-md text-gray-400">{trackInfo.artist}</p>
      <p class="text-sm text-gray-500">{trackInfo.album}</p>
    </div>
  </div>

  <div class="flex justify-center items-center gap-4 my-6">
    <button onclick={previous} class="text-3xl text-gray-400 hover:text-white transition-colors">⏮️</button>
    <button onclick={transportState === 'PLAYING' ? pause : play} class="text-5xl text-white bg-blue-600 hover:bg-blue-500 rounded-full w-16 h-16 flex items-center justify-center transition-colors">
      {transportState === 'PLAYING' ? '⏸️' : '▶️'}
    </button>
    <button onclick={stop} class="text-3xl text-gray-400 hover:text-white transition-colors">⏹️</button>
    <button onclick={next} class="text-3xl text-gray-400 hover:text-white transition-colors">⏭️</button>
  </div>

  <div class="flex items-center gap-3">
    <button onclick={toggleMute} class="text-2xl text-gray-400 hover:text-white transition-colors">{isMuted ? '🔇' : '🔊'}</button>
    <input type="range" min="0" max="100" value={volume} oninput={handleVolumeInput} class="w-full" />
  </div>
</div>