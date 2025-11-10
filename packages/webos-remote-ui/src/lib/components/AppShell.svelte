<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import ConnectionModeSwitcher from '$components/ConnectionModeSwitcher.svelte';
  import ManualConnectionForm from '$components/ManualConnectionForm.svelte';
  import TvListConnectionForm from '$components/TvListConnectionForm.svelte';
  import PowerStatusIndicator from '$components/PowerStatusIndicator.svelte';
  import StatusBanner from '$components/StatusBanner.svelte';
  import ScreenshotPanel from '$components/ScreenshotPanel.svelte';
  import RemoteControls from '$components/RemoteControls.svelte';
  import NotificationHost from '$components/NotificationHost.svelte';
  import { connectionStore } from '$stores/connection';
  import { tvListStore, tvOptionsStore, findTvByName } from '$stores/tv-list';
  import { powerStateStore } from '$stores/power-state';
  import { screenshotService } from '$services/screenshot-service';
  import { remoteService } from '$services/remote-service';
  import { notificationStore } from '$stores/notifications';
  import { isValidIp, isValidMac, normalizeMac, type ConnectionMode } from '$utils/network';

  $: connection = $connectionStore;
  $: powerState = $powerStateStore;
  $: screenshotState = $screenshotService;
  $: tvOptions = $tvOptionsStore;

  let wasConnected = false;

  $: {
    const connected = connection.status === 'connected';
    if (wasConnected && !connected) {
      screenshotService.reset();
    }
    wasConnected = connected;
  }

  $: certLink = connection.ipAddress ? `https://${connection.ipAddress}:3001` : '';
  $: wakeDisabled = !isValidIp(connection.ipAddress) || !isValidMac(connection.macAddress) || powerState.isWakeInProgress || powerState.isCheckInProgress;
  $: showControls = connection.status === 'connected';

  onMount(() => {
    if (!browser) return;
    tvListStore.load();
    if (isValidIp(connection.ipAddress) && isValidMac(connection.macAddress)) {
      powerStateStore.scheduleCheck(connection.ipAddress, connection.macAddress, 150);
    }
  });

  function handleModeChange(mode: ConnectionMode) {
    connectionStore.setConnectionMode(mode);
    if (mode === 'list') {
      const selected = findTvByName(connection.selectedTvName);
      if (selected) {
        connectionStore.selectTv(selected);
        powerStateStore.scheduleCheck(selected.ip, selected.macAddress ?? '', 150);
      }
    } else {
      powerStateStore.setStatus('unknown', 'מצב המסך לא ידוע');
    }
  }

  function handleManualIpInput(value: string) {
    connectionStore.updateManual({ ipAddress: value.trim() });
    powerStateStore.setStatus('unknown', 'מצב המסך לא ידוע');
  }

  function handleManualIpBlur(value: string) {
    const normalizedMac = normalizeMac(connection.macAddress ?? '');
    if (isValidIp(value.trim()) && isValidMac(normalizedMac)) {
      powerStateStore.scheduleCheck(value.trim(), normalizedMac, 0);
    }
  }

  function handleClientKeyInput(value: string) {
    connectionStore.updateManual({ clientKey: value });
  }

  function handleMacInput(value: string) {
    connectionStore.updateManual({ macAddress: value });
  }

  function handleMacBlur(value: string) {
    const normalized = normalizeMac(value);
    connectionStore.updateManual({ macAddress: normalized });
    if (isValidIp(connection.ipAddress) && isValidMac(normalized)) {
      powerStateStore.scheduleCheck(connection.ipAddress, normalized, 0);
    } else {
      powerStateStore.setStatus('unknown', 'מצב המסך לא ידוע');
    }
  }

  function handleSelectTv(name: string) {
    const tv = findTvByName(name);
    connectionStore.selectTv(tv ?? null);
    if (tv && tv.macAddress && isValidIp(tv.ip)) {
      powerStateStore.scheduleCheck(tv.ip, tv.macAddress, 150);
    }
  }

  async function connect() {
    try {
      await remoteService.connect(connection.ipAddress, connection.clientKey || undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'שגיאת התחברות';
      notificationStore.push('error', message);
    }
  }

  function disconnect() {
    remoteService.disconnect();
    screenshotService.reset();
  }

  async function wakeTv() {
    try {
      await powerStateStore.wake(connection.ipAddress, connection.macAddress);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notificationStore.push('error', message);
    }
  }

  function takeScreenshot() {
    screenshotService.captureOnce();
  }

  function toggleContinuous(enabled: boolean) {
    screenshotService.setContinuous(enabled);
  }

  function refreshPowerStatus() {
    powerStateStore.scheduleCheck(connection.ipAddress, connection.macAddress, 0);
  }

  $: tvListError = (() => {
    const state = $tvListStore;
    if (state.status === 'error') {
      return state.error ?? 'שגיאה בטעינת רשימת הטלוויזיות';
    }
    return undefined;
  })();
</script>

<NotificationHost />

<div class="container">
  <h1>שלט רחוק WebOS</h1>
  <div id="main-content-wrapper">
    <div id="left-column">
      <div class="card">
        <h2>התחברות</h2>
        <ConnectionModeSwitcher mode={connection.connectionMode} on:change={(event) => handleModeChange(event.detail)} />

        {#if connection.connectionMode === 'manual'}
          <ManualConnectionForm
            ipAddress={connection.ipAddress}
            clientKey={connection.clientKey}
            macAddress={connection.macAddress}
            on:ipInput={(event) => handleManualIpInput(event.detail)}
            on:ipBlur={(event) => handleManualIpBlur(event.detail)}
            on:clientKeyInput={(event) => handleClientKeyInput(event.detail)}
            on:macInput={(event) => handleMacInput(event.detail)}
            on:macBlur={(event) => handleMacBlur(event.detail)}
          />
        {:else}
          <TvListConnectionForm
            options={tvOptions}
            selectedName={connection.selectedTvName}
            isLoading={$tvListStore.status === 'loading'}
            error={tvListError}
            on:select={(event) => handleSelectTv(event.detail)}
          />
        {/if}

        <button
          id="power-status-wrapper"
          type="button"
          class="power-status-refresh"
          style="margin: 10px 0;"
          on:click={refreshPowerStatus}
        >
          <PowerStatusIndicator status={powerState.status} message={powerState.message} />
        </button>

        <div class="input-group">
          <button id="wake-btn" type="button" disabled={wakeDisabled} on:click={wakeTv}>הפעל מסך (WoL)</button>
          <button id="connect-btn" disabled={connection.status === 'connected' || connection.status === 'connecting'} on:click={connect}>
            {connection.status === 'connecting' ? 'מתחבר...' : 'התחבר'}
          </button>
          <button id="disconnect-btn" type="button" disabled={connection.status !== 'connected'} on:click={disconnect}>התנתק</button>
        </div>

        <p>
          <strong>הערה:</strong> אם זו הפעם הראשונה, יש לאשר את החריגה האבטחתית בדפדפן.
          {#if certLink}
            <a id="cert-link" href={certLink} target="_blank" rel="noreferrer">פתח קישור לאישור תעודה</a>.
          {/if}
        </p>
        <StatusBanner status={connection.status} message={connection.statusMessage} />
      </div>
    </div>

    {#if showControls}
      <div id="controls-screenshot-wrapper" style="gap: 20px;">
        <ScreenshotPanel
          screenshotUrl={screenshotState.url}
          isContinuous={screenshotState.isContinuous}
          isConnected={showControls}
          isLoading={screenshotState.isLoading}
          on:capture={takeScreenshot}
          on:toggle={(event) => toggleContinuous(event.detail)}
        />
        <RemoteControls isConnected={showControls} />
      </div>
    {/if}
  </div>
</div>
